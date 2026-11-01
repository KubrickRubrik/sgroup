import * as vscode from 'vscode';
import {
  AccessStore,
  ensureSecrets,
  getSecret,
  readOriginRepoUrl,
  readProfileHostToken,
  repoUrlsMatch,
  ReviewPageAccess,
  SECRET_DISCORD,
  storeSecrets,
} from './accessStore';
import {
  DiscordMessage,
  editChannelMessage,
  ensureThread,
  findMrMessage,
  formatMrDiscordBody,
  formatReviewDiscordBody,
  getChannelMessage,
  isMrMessage,
  isReviewMessage,
  listChannelMessages,
  listThreadMessages,
  parseMrChip,
  parseReviewAttachment,
  parseReviewMessagePill,
  fetchAttachmentText,
  postChannelMessage,
  postMessageWithFile,
  replaceMrDiscordColor,
  replaceMrDiscordHead,
  sortMessagesAsc,
} from './discordApi';
import {
  collectMrTargetBranches,
  currentBranch,
  detectParentBranch,
  ensureBranchPushed,
  ensureCommittedBeforeMr,
} from './gitOps';
import { createMergeRequest, findOpenMrByBranch, updateMergeRequest } from './gitlabApi';
import { createPullRequest, findOpenPrByBranch, updatePullRequest } from './githubApi';
import { LINK_PALETTE_DEFAULT, randomLinkPaletteColor } from './linkPalette';
import { normalizeHex } from './palette';
import {
  detectProviderFromRepoUrl,
  providerMatchesRepo,
  ReviewHostProvider,
  ReviewMr,
} from './reviewHost';
import { deleteReviewFile, runReviewSkill, writeReviewFile } from './reviewAgent';
import { ReviewKind, ReviewPendingStore } from './reviewPending';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export interface ReviewThreadMsg {
  id: string;
  content: string;
  author?: string;
  timestamp: string;
  isReview: boolean;
  /** True when attachment parsed to a review pill with H/M/L. */
  isPill?: boolean;
  /** Label for the review pill, e.g. `Ревью 1 | H:4 | M:4 | L:5`. */
  pillLabel?: string;
  /** Discord attachment on this message. The CDN url stays on the host. */
  hasFile?: boolean;
  filename?: string;
  contentMissing?: boolean;
}

export interface ReviewChip {
  id: string;
  content: string;
  author?: string;
  timestamp: string;
  isMr: boolean;
  webUrl?: string;
  title?: string;
  draft?: boolean;
  color?: string;
  threadId?: string;
  hasThread?: boolean;
  replies: ReviewThreadMsg[];
  repliesHasMore: boolean;
  /** Thread replies were fetched for this parent. */
  repliesLoaded?: boolean;
  contentMissing?: boolean;
}

/** Where a channel fetch is painting placeholder threads. */
export type ReviewLoadEdge = 'initial' | 'older' | 'newer';

export interface ReviewPageState {
  pageId: string;
  loading: boolean;
  /** Set only while a channel fetch is in flight, so the map can place skeletons. */
  loadingEdge?: ReviewLoadEdge;
  error?: string;
  empty?: boolean;
  /** Most channel texts came back empty — usually Message Content Intent is off. */
  contentBlocked?: boolean;
  messages: ReviewChip[];
  canLoadOlder: boolean;
  canLoadNewer: boolean;
  focusMessageId?: string;
}

function toChip(
  msg: DiscordMessage,
  replies: ReviewThreadMsg[] = [],
  repliesHasMore = false,
  repliesLoaded = false,
): ReviewChip {
  const isMr = isMrMessage(msg.content);
  const parsed = isMr ? parseMrChip(msg.content) : {};
  return {
    id: msg.id,
    content: msg.content,
    author: msg.author,
    timestamp: msg.timestamp,
    isMr,
    webUrl: parsed.webUrl,
    title: parsed.title,
    draft: parsed.draft,
    color: parsed.color || (isMr ? LINK_PALETTE_DEFAULT : undefined),
    threadId: msg.thread?.id,
    hasThread: !!msg.thread?.id || !!msg.hasThread,
    replies,
    repliesHasMore,
    repliesLoaded,
    contentMissing: msg.contentMissing,
  };
}

function reviewAttachment(msg: DiscordMessage): { filename: string; url: string } | undefined {
  const files = msg.attachments ?? [];
  return files.find((file) => /\.(md|markdown|txt)$/i.test(file.filename)) ?? files[0];
}

function toReplyBase(msg: DiscordMessage): ReviewThreadMsg {
  const file = reviewAttachment(msg);
  return {
    id: msg.id,
    content: msg.content,
    author: msg.author,
    timestamp: msg.timestamp,
    isReview: isReviewMessage(msg.content),
    hasFile: !!file,
    filename: file?.filename,
    contentMissing: msg.contentMissing,
  };
}

/** Messages shown on the map. */
const CHANNEL_VISIBLE = 5;
/** Extra message fetched on a side to know if a load button is needed (no total from Discord). */
const CHANNEL_PROBE = 1;
/** One-sided fetch: visible page + one probe. */
const CHANNEL_FETCH_SIDE = CHANNEL_VISIBLE + CHANNEL_PROBE;
/** Around-target fetch: visible + probe before + probe after. */
const CHANNEL_FETCH_AROUND = CHANNEL_VISIBLE + 2 * CHANNEL_PROBE;
/** Initial MR thread window. */
const THREAD_INITIAL = 3;
/** Thread page size when loading more / plain expand. */
const THREAD_PAGE = 5;
/** Extra reply fetched to know whether «load more» is needed. */
const THREAD_PROBE = 1;

type ReviewWindow = {
  messages: DiscordMessage[];
  threads: Map<string, { replies: DiscordMessage[]; exhausted: boolean }>;
  focusMessageId?: string;
  /** More history exists before the oldest message in the window. */
  canLoadOlder: boolean;
  /** More messages exist after the newest message in the window. */
  canLoadNewer: boolean;
};

/**
 * Tip of the channel: newest messages. Fetch visible+1; drop the oldest as older-probe.
 * Nothing newer exists at the tip.
 */
function windowFromChannelTip(fetchedAsc: DiscordMessage[]): Pick<
  ReviewWindow,
  'messages' | 'canLoadOlder' | 'canLoadNewer'
> {
  const sorted = sortMessagesAsc(fetchedAsc);
  if (sorted.length > CHANNEL_VISIBLE) {
    return {
      messages: sorted.slice(-CHANNEL_VISIBLE),
      canLoadOlder: true,
      canLoadNewer: false,
    };
  }
  return {
    messages: sorted,
    canLoadOlder: false,
    canLoadNewer: false,
  };
}

/**
 * Older batch fetched with `before` (already sorted asc, excluding known ids).
 * Keep the newest `CHANNEL_VISIBLE` (closest to the open window); an extra oldest
 * item is the probe that more history exists.
 */
function takeOlderPage(batchAsc: DiscordMessage[]): {
  toAdd: DiscordMessage[];
  canLoadOlder: boolean;
} {
  if (batchAsc.length > CHANNEL_VISIBLE) {
    return {
      toAdd: batchAsc.slice(-CHANNEL_VISIBLE),
      canLoadOlder: true,
    };
  }
  return { toAdd: batchAsc, canLoadOlder: false };
}

/**
 * Newer batch fetched with `after`. Keep the oldest `CHANNEL_VISIBLE` (closest to
 * the open window); an extra newest item is the probe.
 */
function takeNewerPage(batchAsc: DiscordMessage[]): {
  toAdd: DiscordMessage[];
  canLoadNewer: boolean;
} {
  if (batchAsc.length > CHANNEL_VISIBLE) {
    return {
      toAdd: batchAsc.slice(0, CHANNEL_VISIBLE),
      canLoadNewer: true,
    };
  }
  return { toAdd: batchAsc, canLoadNewer: false };
}

/**
 * Jump window: up to 2 before + target + 2 after. Probes beyond that in the
 * same fetch tell whether load-older / load-newer buttons are needed.
 */
function mrIidFromWebUrl(webUrl: string): number | undefined {
  const match = /\/merge_requests\/(\d+)\b|\/pull\/(\d+)\b/.exec(webUrl);
  const raw = match?.[1] || match?.[2];
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function windowAroundMessage(
  fetchedAsc: DiscordMessage[],
  messageId: string,
): Pick<ReviewWindow, 'messages' | 'canLoadOlder' | 'canLoadNewer'> {
  const sorted = sortMessagesAsc(fetchedAsc);
  const idx = sorted.findIndex((m) => m.id === messageId);
  if (idx < 0) {
    return windowFromChannelTip(sorted);
  }
  const beforeAll = sorted.slice(0, idx);
  const afterAll = sorted.slice(idx + 1);
  const showBefore = beforeAll.slice(-2);
  const showAfter = afterAll.slice(0, 2);
  return {
    messages: [...showBefore, sorted[idx], ...showAfter],
    canLoadOlder: beforeAll.length > showBefore.length,
    canLoadNewer: afterAll.length > showAfter.length,
  };
}

export type ReviewProfilePaths = {
  skillPath: string;
  dirPath: string;
  model: string;
};

export type ReviewProfileContext = ReviewProfilePaths & {
  profileId: string;
  profileName: string;
  githubNick: string;
  gitlabNick: string;
};

export class ReviewMapController {
  private readonly access: AccessStore;
  private readonly pending: ReviewPendingStore;
  /** In-memory channel window per page. */
  private readonly windows = new Map<string, ReviewWindow>();
  private readonly loading = new Set<string>();
  /** Channel fetch the map should show as skeletons. Depth covers overlapping loads. */
  private readonly loadEdge = new Map<string, { edge: ReviewLoadEdge; depth: number }>();
  private readonly errors = new Map<string, string>();
  /** Cached pill labels from message text, keyed by reply message id. */
  private readonly replyMeta = new Map<string, { isPill: boolean; pillLabel?: string }>();
  /** Downloaded review attachments, keyed by Discord message id. */
  private readonly fileCache = new Map<string, { filename: string; text: string }>();

  constructor(
    private readonly root: vscode.Uri,
    private readonly secrets: vscode.SecretStorage,
    private readonly profileContext: () => ReviewProfileContext = () => ({
      skillPath: '',
      dirPath: '',
      model: '',
      profileId: 'general',
      profileName: '',
      githubNick: '',
      gitlabNick: '',
    }),
  ) {
    this.access = new AccessStore(root);
    this.pending = new ReviewPendingStore(root);
  }

  private profilePaths(): ReviewProfilePaths {
    const ctx = this.profileContext();
    return { skillPath: ctx.skillPath, dirPath: ctx.dirPath, model: ctx.model };
  }

  accessStore(): AccessStore {
    return this.access;
  }

  cwd(): string {
    return this.root.fsPath;
  }

  async getAccess(pageId: string): Promise<ReviewPageAccess | undefined> {
    await this.access.ensureLoaded();
    return this.access.page(pageId);
  }

  /**
   * Mark a channel fetch before the Discord round-trip so the map can paint skeletons.
   * Pair with finishLoad. Does not clear the current window.
   */
  beginLoad(pageId: string, edge: ReviewLoadEdge): ReviewPageState {
    const current = this.loadEdge.get(pageId);
    if (current) {
      current.depth += 1;
      current.edge = edge;
    } else {
      this.loadEdge.set(pageId, { edge, depth: 1 });
    }
    this.loading.add(pageId);
    this.errors.delete(pageId);
    return this.snapshot(pageId);
  }

  /** Drop one skeleton edge after the channel fetch settles. */
  finishLoad(pageId: string): ReviewPageState {
    const current = this.loadEdge.get(pageId);
    if (current) {
      current.depth -= 1;
      if (current.depth <= 0) {
        this.loadEdge.delete(pageId);
      }
    }
    if (!this.loadEdge.has(pageId)) {
      this.loading.delete(pageId);
    }
    return this.snapshot(pageId);
  }

  hasWindow(pageId: string): boolean {
    return this.windows.has(pageId);
  }

  /** Forget a channel window so the next open fetches again. */
  dropWindow(pageId: string): void {
    this.windows.delete(pageId);
    this.errors.delete(pageId);
  }

  isLoading(pageId: string): boolean {
    return this.loading.has(pageId);
  }

  snapshot(pageId: string): ReviewPageState {
    const win = this.windows.get(pageId);
    const loading = this.loading.has(pageId);
    const loadingEdge = this.loadEdge.get(pageId)?.edge;
    const error = this.errors.get(pageId);
    if (!win) {
      return {
        pageId,
        loading,
        loadingEdge,
        error,
        empty: !loading && !error,
        messages: [],
        canLoadOlder: false,
        canLoadNewer: false,
      };
    }
    const messages = win.messages.map((m) => {
      const thread = m.thread?.id ? win.threads.get(m.thread.id) : undefined;
      const replies = (thread?.replies ?? []).map((r) => {
        const base = toReplyBase(r);
        const meta = this.replyMeta.get(r.id);
        if (!meta) {
          return base;
        }
        return { ...base, isPill: meta.isPill, pillLabel: meta.pillLabel };
      });
      const loaded = !!thread;
      const hasMore = thread
        ? !thread.exhausted
        : !!(m.thread?.id || m.hasThread);
      return toChip(m, replies, hasMore, loaded);
    });
    const missingCount = messages.filter((m) => m.contentMissing).length;
    const contentBlocked =
      messages.length > 0 && missingCount >= Math.ceil(messages.length * 0.6);
    return {
      pageId,
      loading,
      loadingEdge,
      error,
      empty: !loading && !error && messages.length === 0,
      contentBlocked,
      messages,
      canLoadOlder: win.canLoadOlder,
      canLoadNewer: win.canLoadNewer,
      focusMessageId: win.focusMessageId,
    };
  }

  private async discordToken(): Promise<string | undefined> {
    return getSecret(this.secrets, SECRET_DISCORD);
  }

  private profileId(): string {
    return this.profileContext().profileId || 'general';
  }

  private async hostToken(provider: ReviewHostProvider): Promise<string | undefined> {
    return readProfileHostToken(this.secrets, this.profileId(), provider);
  }

  /** Login from the active profile binding for this host. */
  private hostNick(provider: ReviewHostProvider): string {
    const ctx = this.profileContext();
    return (provider === 'github' ? ctx.githubNick : ctx.gitlabNick).trim().replace(/^@+/, '');
  }

  private async findOpenByBranch(
    access: ReviewPageAccess,
    token: string,
    sourceBranch: string,
  ): Promise<{ ok: true; value: ReviewMr | undefined } | { ok: false; message: string }> {
    if (access.provider === 'github') {
      return findOpenPrByBranch(access.repoUrl, token, sourceBranch);
    }
    return findOpenMrByBranch(access.repoUrl, token, sourceBranch);
  }

  async loadInitial(pageId: string): Promise<ReviewPageState> {
    this.loading.add(pageId);
    this.errors.delete(pageId);
    try {
      const access = await this.getAccess(pageId);
      const token = await this.discordToken();
      if (!access) {
        this.errors.set(pageId, 'Review page access is not configured');
        this.windows.delete(pageId);
      } else if (!token) {
        this.errors.set(pageId, 'Discord bot token is missing');
        this.windows.delete(pageId);
      } else {
        // Tip: visible + 1 older probe. No newer probe — we are at the channel tip.
        const result = await listChannelMessages(token, access.channelId, {
          limit: CHANNEL_FETCH_SIDE,
        });
        if (!result.ok) {
          this.errors.set(pageId, result.message || 'ошибка синхронизации с discord');
          this.windows.delete(pageId);
        } else {
          const sliced = windowFromChannelTip(result.value);
          const win: ReviewWindow = {
            ...sliced,
            threads: new Map<string, { replies: DiscordMessage[]; exhausted: boolean }>(),
            focusMessageId: undefined,
          };
          this.windows.set(pageId, win);
          await this.prefetchThreads(token, win);
        }
      }
    } finally {
      this.loading.delete(pageId);
    }
    return this.snapshot(pageId);
  }

  private async enrichReplies(_token: string, replies: DiscordMessage[]): Promise<void> {
    for (const msg of replies) {
      if (this.replyMeta.has(msg.id)) {
        continue;
      }
      const pillLabel = parseReviewMessagePill(msg.content);
      if (pillLabel) {
        this.replyMeta.set(msg.id, { isPill: true, pillLabel });
      } else {
        this.replyMeta.set(msg.id, { isPill: false });
      }
    }
  }

  private async prefetchThreads(token: string, win: ReviewWindow): Promise<void> {
    let first = true;
    for (const msg of win.messages) {
      // Autoload last THREAD_INITIAL replies for any parent that already has a thread.
      const threadId = msg.thread?.id;
      if (!threadId || win.threads.has(threadId)) {
        continue;
      }
      if (!first) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      first = false;
      const replies = await listThreadMessages(token, threadId, {
        limit: THREAD_INITIAL + THREAD_PROBE,
      });
      if (!replies.ok) {
        continue;
      }
      const sorted = sortMessagesAsc(replies.value);
      const hasMore = sorted.length > THREAD_INITIAL;
      const last = sorted.slice(-THREAD_INITIAL);
      win.threads.set(threadId, {
        replies: last,
        exhausted: !hasMore,
      });
      await this.enrichReplies(token, last);
    }
  }

  async loadOlder(pageId: string): Promise<ReviewPageState> {
    return this.extendWindow(pageId, 'older');
  }

  async loadNewer(pageId: string): Promise<ReviewPageState> {
    return this.extendWindow(pageId, 'newer');
  }

  private async extendWindow(pageId: string, direction: 'older' | 'newer'): Promise<ReviewPageState> {
    const win = this.windows.get(pageId);
    const access = await this.getAccess(pageId);
    const token = await this.discordToken();
    if (!win || !access || !token || win.messages.length === 0) {
      return this.snapshot(pageId);
    }
    this.loading.add(pageId);
    this.errors.delete(pageId);
    try {
      const edge = direction === 'older' ? win.messages[0] : win.messages[win.messages.length - 1];
      const result = await listChannelMessages(token, access.channelId, {
        limit: CHANNEL_FETCH_SIDE,
        ...(direction === 'older' ? { before: edge.id } : { after: edge.id }),
      });
      if (!result.ok) {
        this.errors.set(pageId, result.message || 'ошибка синхронизации с discord');
      } else {
        const known = new Set(win.messages.map((m) => m.id));
        const batch = sortMessagesAsc(result.value.filter((m) => !known.has(m.id)));
        if (direction === 'older') {
          const { toAdd, canLoadOlder } = takeOlderPage(batch);
          win.messages = sortMessagesAsc([...toAdd, ...win.messages]);
          win.canLoadOlder = canLoadOlder;
        } else {
          const { toAdd, canLoadNewer } = takeNewerPage(batch);
          win.messages = sortMessagesAsc([...win.messages, ...toAdd]);
          win.canLoadNewer = canLoadNewer;
        }
        await this.prefetchThreads(token, win);
      }
    } finally {
      this.loading.delete(pageId);
    }
    return this.snapshot(pageId);
  }

  async loadMoreThread(pageId: string, messageId: string): Promise<ReviewPageState> {
    const win = this.windows.get(pageId);
    const token = await this.discordToken();
    if (!win || !token) {
      return this.snapshot(pageId);
    }
    const parent = win.messages.find((m) => m.id === messageId);
    const threadId = parent?.thread?.id;
    if (!threadId) {
      return this.snapshot(pageId);
    }
    this.loading.add(pageId);
    try {
      let entry = win.threads.get(threadId);
      if (!entry) {
        entry = { replies: [], exhausted: false };
        win.threads.set(threadId, entry);
      }
      const before = entry.replies[0]?.id;
      const pageSize = entry.replies.length === 0 ? THREAD_INITIAL : THREAD_PAGE;
      const result = await listThreadMessages(token, threadId, {
        limit: pageSize + THREAD_PROBE,
        before,
      });
      if (!result.ok) {
        this.errors.set(pageId, result.message || 'ошибка синхронизации с discord');
      } else {
        const known = new Set(entry.replies.map((m) => m.id));
        const fetched = sortMessagesAsc(result.value).filter((m) => !known.has(m.id));
        const hasMore = fetched.length > pageSize;
        const toAdd = hasMore ? fetched.slice(-pageSize) : fetched;
        entry.replies = sortMessagesAsc([...toAdd, ...entry.replies]);
        entry.exhausted = !hasMore;
        await this.enrichReplies(token, toAdd);
      }
    } finally {
      this.loading.delete(pageId);
    }
    return this.snapshot(pageId);
  }

  /**
   * Expand a plain (non-MR) channel message: ensure/load its thread (last 3 + probe).
   * Kept for late-created threads; initial load already prefetches all parents.
   */
  async expandPlainThread(pageId: string, messageId: string): Promise<ReviewPageState> {
    const win = this.windows.get(pageId);
    const token = await this.discordToken();
    if (!win || !token) {
      return this.snapshot(pageId);
    }
    const parent = win.messages.find((m) => m.id === messageId);
    if (!parent || isMrMessage(parent.content)) {
      return this.snapshot(pageId);
    }
    this.loading.add(pageId);
    this.errors.delete(pageId);
    try {
      const threadId = parent.thread?.id;
      if (threadId && !win.threads.has(threadId)) {
        const result = await listThreadMessages(token, threadId, {
          limit: THREAD_INITIAL + THREAD_PROBE,
        });
        if (!result.ok) {
          this.errors.set(pageId, result.message || 'ошибка синхронизации с discord');
        } else {
          const sorted = sortMessagesAsc(result.value);
          const hasMore = sorted.length > THREAD_INITIAL;
          const last = sorted.slice(-THREAD_INITIAL);
          win.threads.set(threadId, { replies: last, exhausted: !hasMore });
          await this.enrichReplies(token, last);
        }
      }
    } finally {
      this.loading.delete(pageId);
    }
    return this.snapshot(pageId);
  }

  async jumpAroundMessage(pageId: string, messageId: string): Promise<ReviewPageState> {
    const access = await this.getAccess(pageId);
    const token = await this.discordToken();
    if (!access || !token) {
      return this.snapshot(pageId);
    }
    this.loading.add(pageId);
    this.errors.delete(pageId);
    try {
      // 5 visible + 1 older probe + 1 newer probe.
      const result = await listChannelMessages(token, access.channelId, {
        around: messageId,
        limit: CHANNEL_FETCH_AROUND,
      });
      if (!result.ok) {
        this.errors.set(pageId, result.message || 'ошибка синхронизации с discord');
      } else {
        const sliced = windowAroundMessage(result.value, messageId);
        const win: ReviewWindow = {
          ...sliced,
          threads: new Map<string, { replies: DiscordMessage[]; exhausted: boolean }>(),
          focusMessageId: messageId,
        };
        this.windows.set(pageId, win);
        await this.prefetchThreads(token, win);
      }
    } finally {
      this.loading.delete(pageId);
    }
    return this.snapshot(pageId);
  }

  clearFocus(pageId: string): void {
    const win = this.windows.get(pageId);
    if (win) {
      win.focusMessageId = undefined;
    }
  }

  /**
   * Periodic refresh: at the live tip reload the newest window; otherwise only pull newer.
   */
  async pollRefresh(pageId: string): Promise<ReviewPageState> {
    if (this.loading.has(pageId)) {
      return this.snapshot(pageId);
    }
    const win = this.windows.get(pageId);
    if (!win) {
      return this.loadInitial(pageId);
    }
    if (win.canLoadNewer) {
      return this.extendWindow(pageId, 'newer');
    }
    return this.loadInitial(pageId);
  }

  async createPageDefaults(): Promise<
    | {
        origin: string;
        suggestedProvider: ReviewHostProvider;
        hasGitlab: boolean;
        hasGithub: boolean;
        hasDiscord: boolean;
        githubToken: string;
        gitlabToken: string;
      }
    | { error: string }
  > {
    const origin = await readOriginRepoUrl(this.cwd());
    if (!origin) {
      return { error: 'git remote origin not found' };
    }
    const profileId = this.profileId();
    const githubToken = (await readProfileHostToken(this.secrets, profileId, 'github')) || '';
    const gitlabToken = (await readProfileHostToken(this.secrets, profileId, 'gitlab')) || '';
    const discord = (await this.discordToken()) || '';
    return {
      origin,
      suggestedProvider: detectProviderFromRepoUrl(origin),
      hasGitlab: !!gitlabToken,
      hasGithub: !!githubToken,
      hasDiscord: !!discord,
      githubToken,
      gitlabToken,
    };
  }

  async applyCreatePageSecrets(opts: {
    provider: ReviewHostProvider;
    gitlabToken?: string;
    githubToken?: string;
    discordToken?: string;
  }): Promise<{ ok: true } | { ok: false; message: string }> {
    const profileId = this.profileId();
    await storeSecrets(this.secrets, {
      profileId,
      gitlab: opts.gitlabToken,
      github: opts.githubToken,
      discord: opts.discordToken,
    });
    const tokens = await ensureSecrets(this.secrets, opts.provider, profileId);
    if (!tokens) {
      const hostLabel = opts.provider === 'github' ? 'GitHub' : 'GitLab';
      return {
        ok: false,
        message: `${hostLabel} and Discord bot tokens are required`,
      };
    }
    return { ok: true };
  }

  validateCreateAccess(opts: {
    provider: ReviewHostProvider;
    channelId: string;
    repoUrl: string;
    origin: string;
  }): string | undefined {
    if (!/^\d{5,}$/.test(opts.channelId.trim())) {
      return 'Enter a numeric Discord channel id';
    }
    if (!opts.repoUrl.trim()) {
      return 'Repository URL is required';
    }
    if (!repoUrlsMatch(opts.repoUrl, opts.origin)) {
      return `Repository URL must match origin (${opts.origin})`;
    }
    if (!providerMatchesRepo(opts.provider, opts.origin)) {
      return opts.provider === 'github'
        ? 'GitHub provider requires a github.com origin'
        : 'GitLab provider requires a non-GitHub origin';
    }
    return undefined;
  }

  async savePageAccess(pageId: string, access: ReviewPageAccess): Promise<void> {
    await this.access.setPage(pageId, access);
  }

  async deletePageAccess(pageId: string): Promise<void> {
    await this.access.deletePage(pageId);
    this.windows.delete(pageId);
    this.errors.delete(pageId);
  }

  async listTargetBranches(): Promise<{ current: string; parent: string; branches: string[] } | undefined> {
    const branch = await currentBranch(this.cwd());
    if (!branch.ok) {
      void vscode.window.showErrorMessage(branch.message);
      return undefined;
    }
    const parent = (await detectParentBranch(this.cwd())) || 'development';
    const branches = await collectMrTargetBranches(this.cwd(), branch.value, parent);
    return { current: branch.value, parent, branches };
  }

  private async postMrToDiscord(
    access: ReviewPageAccess,
    mr: ReviewMr,
  ): Promise<{ ok: true; message: DiscordMessage } | { ok: false; message: string }> {
    const token = await this.discordToken();
    if (!token) {
      return { ok: false, message: 'Discord bot token is missing' };
    }
    const body = formatMrDiscordBody({
      webUrl: mr.web_url,
      title: mr.title,
      draft: mr.draft,
      color: randomLinkPaletteColor(),
      provider: access.provider,
      iid: mr.iid,
      sourceBranch: mr.source_branch,
      repoUrl: access.repoUrl,
      reviewAuthor: this.profileContext().profileName,
      assignees: mr.assignees.map((a) => a.username),
    });
    const posted = await postChannelMessage(token, access.channelId, body);
    if (!posted.ok) {
      return { ok: false, message: posted.message };
    }
    return { ok: true, message: posted.value };
  }

  /**
   * Put a message Discord just accepted at the end of the open channel window.
   * Re-reads it from Discord so the list matches the stored text.
   */
  private async appendPostedMessage(pageId: string, channelId: string, posted: DiscordMessage): Promise<void> {
    const token = await this.discordToken();
    let message = posted;
    if (token) {
      const fresh = await getChannelMessage(token, channelId, posted.id);
      if (fresh.ok) {
        message = fresh.value;
      }
    }
    let win = this.windows.get(pageId);
    if (!win || win.canLoadNewer) {
      await this.loadInitial(pageId);
      win = this.windows.get(pageId);
    }
    if (!win) {
      return;
    }
    const idx = win.messages.findIndex((item) => item.id === message.id);
    if (idx >= 0) {
      const prev = win.messages[idx];
      win.messages[idx] = {
        ...message,
        thread: message.thread ?? prev.thread,
        hasThread: message.hasThread || prev.hasThread,
      };
    } else {
      win.messages = sortMessagesAsc([...win.messages, message]);
      if (win.messages.length > CHANNEL_VISIBLE) {
        win.messages = win.messages.slice(-CHANNEL_VISIBLE);
        win.canLoadOlder = true;
      }
      win.canLoadNewer = false;
    }
    win.focusMessageId = message.id;
  }

  /**
   * «+» on a review page: create MR/PR or post existing one / focus chip.
   */
  async handleCreateMr(pageId: string): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | {
        kind: 'needPanel';
        branches: string[];
        parent: string;
        people: Array<{ nick: string; name?: string }>;
        defaultAssignee: string;
        provider: ReviewHostProvider;
      }
    | { kind: 'discordFail'; mr: ReviewMr; message: string }
    | { kind: 'error'; message: string }
  > {
    const access = await this.getAccess(pageId);
    if (!access) {
      return { kind: 'error', message: 'Review page access is not configured' };
    }
    const host = await this.hostToken(access.provider);
    if (!host) {
      const label = access.provider === 'github' ? 'GitHub' : 'GitLab';
      return { kind: 'error', message: `${label} token is missing` };
    }

    const branch = await currentBranch(this.cwd());
    if (!branch.ok) {
      return { kind: 'error', message: branch.message };
    }

    const existing = await this.findOpenByBranch(access, host, branch.value);
    if (!existing.ok) {
      return { kind: 'error', message: existing.message };
    }

    if (!existing.value) {
      const parent = (await detectParentBranch(this.cwd())) || 'development';
      const branches = await collectMrTargetBranches(this.cwd(), branch.value, parent);
      const nick = this.hostNick(access.provider);
      return {
        kind: 'needPanel',
        branches,
        parent,
        people: nick ? [{ nick }] : [],
        defaultAssignee: nick,
        provider: access.provider,
      };
    }

    return this.routeExistingMr(pageId, access, existing.value);
  }

  private async routeExistingMr(
    pageId: string,
    access: ReviewPageAccess,
    mr: ReviewMr,
  ): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'discordFail'; mr: ReviewMr; message: string }
    | { kind: 'error'; message: string }
  > {
    const token = await this.discordToken();
    if (!token) {
      return { kind: 'error', message: 'Discord bot token is missing' };
    }
    const found = await findMrMessage(token, access.channelId, mr.web_url);
    if (!found.ok) {
      return { kind: 'discordFail', mr, message: found.message };
    }
    if (found.value) {
      const win = this.windows.get(pageId);
      const visible = win?.messages.some((m) => m.id === found.value!.id);
      if (visible) {
        if (win) {
          win.focusMessageId = found.value.id;
        }
        return { kind: 'state', state: this.snapshot(pageId) };
      }
      const jumped = await this.jumpAroundMessage(pageId, found.value.id);
      return { kind: 'state', state: jumped };
    }

    const posted = await this.postMrToDiscord(access, mr);
    if (!posted.ok) {
      return { kind: 'discordFail', mr, message: posted.message };
    }
    await this.appendPostedMessage(pageId, access.channelId, posted.message);
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  async createMrFromPanel(
    pageId: string,
    opts: {
      title: string;
      draft: boolean;
      targetBranch: string;
      reviewers: string[];
      assignees: string[];
      squash: boolean;
    },
  ): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'discordFail'; mr: ReviewMr; message: string }
    | { kind: 'error'; message: string }
  > {
    const access = await this.getAccess(pageId);
    const host = access ? await this.hostToken(access.provider) : undefined;
    if (!access || !host) {
      return {
        kind: 'error',
        message: `Missing access or ${access?.provider === 'github' ? 'GitHub' : 'GitLab'} token`,
      };
    }
    const committed = await ensureCommittedBeforeMr(this.cwd());
    if (!committed.ok) {
      return { kind: 'error', message: committed.message };
    }
    const branch = await currentBranch(this.cwd());
    if (!branch.ok) {
      return { kind: 'error', message: branch.message };
    }
    const pushed = await ensureBranchPushed(this.cwd(), branch.value);
    if (!pushed.ok) {
      return { kind: 'error', message: pushed.message };
    }
    const created =
      access.provider === 'github'
        ? await createPullRequest(access.repoUrl, host, {
            sourceBranch: branch.value,
            targetBranch: opts.targetBranch,
            title: opts.title.trim(),
            draft: opts.draft,
            reviewerUsernames: opts.reviewers,
            assigneeUsernames: opts.assignees,
          })
        : await createMergeRequest(access.repoUrl, host, {
            sourceBranch: branch.value,
            targetBranch: opts.targetBranch,
            title: opts.title.trim(),
            draft: opts.draft,
            reviewerUsernames: opts.reviewers,
            assigneeUsernames: opts.assignees,
            squash: opts.squash,
          });
    if (!created.ok) {
      return { kind: 'error', message: created.message };
    }
    return this.routeExistingMr(pageId, access, created.value);
  }

  async retryDiscordPost(pageId: string, mr: ReviewMr): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'discordFail'; mr: ReviewMr; message: string }
    | { kind: 'error'; message: string }
  > {
    const access = await this.getAccess(pageId);
    const host = access ? await this.hostToken(access.provider) : undefined;
    if (!access || !host) {
      return {
        kind: 'error',
        message: `Missing access or ${access?.provider === 'github' ? 'GitHub' : 'GitLab'} token`,
      };
    }
    // Refresh MR/PR data then post.
    const fresh = await this.findOpenByBranch(access, host, mr.source_branch);
    const target = fresh.ok && fresh.value ? fresh.value : mr;
    const posted = await this.postMrToDiscord(access, target);
    if (!posted.ok) {
      return { kind: 'discordFail', mr: target, message: posted.message };
    }
    await this.appendPostedMessage(pageId, access.channelId, posted.message);
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  /**
   * Rename or toggle draft on the host MR/PR, or recolor the Discord chip.
   * Color stays in the Discord body and does not touch the host MR/PR.
   */
  async updateMrChip(
    pageId: string,
    messageId: string,
    patch: { title?: string; draft?: boolean; color?: string },
  ): Promise<{ kind: 'state'; state: ReviewPageState } | { kind: 'error'; message: string }> {
    const win = this.windows.get(pageId);
    const access = await this.getAccess(pageId);
    const discord = await this.discordToken();
    const parent = win?.messages.find((item) => item.id === messageId);
    if (!win || !access || !discord || !parent) {
      return { kind: 'error', message: 'MR message not found on the map' };
    }
    if (!isMrMessage(parent.content)) {
      return { kind: 'error', message: 'Select an MR_SYN3 chip' };
    }
    if (patch.color !== undefined && patch.title === undefined && patch.draft === undefined) {
      return this.recolorMrChip(pageId, win, access.channelId, discord, parent, patch.color);
    }
    const parsed = parseMrChip(parent.content);
    if (!parsed.webUrl) {
      return { kind: 'error', message: 'MR link is missing in the Discord message' };
    }
    const iid = mrIidFromWebUrl(parsed.webUrl);
    if (!iid) {
      return { kind: 'error', message: 'Could not read the MR number from the link' };
    }
    const host = await this.hostToken(access.provider);
    if (!host) {
      const label = access.provider === 'github' ? 'GitHub' : 'GitLab';
      return { kind: 'error', message: `${label} token is missing` };
    }
    const apiPatch: { title?: string; draft?: boolean } = {};
    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (!title) {
        return { kind: 'error', message: 'Title is empty' };
      }
      apiPatch.title = title;
      apiPatch.draft = patch.draft !== undefined ? patch.draft : !!parsed.draft;
    } else if (patch.draft !== undefined) {
      apiPatch.draft = patch.draft;
    } else {
      return { kind: 'state', state: this.snapshot(pageId) };
    }
    const updated =
      access.provider === 'github'
        ? await updatePullRequest(access.repoUrl, host, iid, apiPatch)
        : await updateMergeRequest(access.repoUrl, host, iid, apiPatch);
    if (!updated.ok) {
      return { kind: 'error', message: updated.message };
    }
    const nextContent = replaceMrDiscordHead(parent.content, updated.value.draft, updated.value.title);
    const edited = await editChannelMessage(discord, access.channelId, parent.id, nextContent);
    if (!edited.ok) {
      return { kind: 'error', message: edited.message };
    }
    const idx = win.messages.findIndex((item) => item.id === parent.id);
    if (idx >= 0) {
      win.messages[idx] = {
        ...edited.value,
        thread: edited.value.thread ?? parent.thread,
        hasThread: edited.value.hasThread || parent.hasThread,
      };
    }
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  /** Rewrite `color:` on the Discord MR message, then refresh the chip from that body. */
  private async recolorMrChip(
    pageId: string,
    win: ReviewWindow,
    channelId: string,
    discord: string,
    parent: DiscordMessage,
    rawColor: string,
  ): Promise<{ kind: 'state'; state: ReviewPageState } | { kind: 'error'; message: string }> {
    const color = normalizeHex(rawColor);
    if (!color) {
      return { kind: 'error', message: 'Color is not a hex value' };
    }
    const parsed = parseMrChip(parent.content);
    if ((parsed.color || '').toLowerCase() === color) {
      return { kind: 'state', state: this.snapshot(pageId) };
    }
    const edited = await editChannelMessage(
      discord,
      channelId,
      parent.id,
      replaceMrDiscordColor(parent.content, color),
    );
    if (!edited.ok) {
      return { kind: 'error', message: edited.message };
    }
    const idx = win.messages.findIndex((item) => item.id === parent.id);
    if (idx >= 0) {
      win.messages[idx] = {
        ...edited.value,
        thread: edited.value.thread ?? parent.thread,
        hasThread: edited.value.hasThread || parent.hasThread,
      };
    }
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  /**
   * Download the review attachment for a thread message.
   * The Discord body has no file URL; the file is `attachments[0]`.
   */
  async readReviewAttachment(
    pageId: string,
    messageId: string,
  ): Promise<{ ok: true; filename: string; text: string } | { ok: false; message: string }> {
    const cached = this.fileCache.get(messageId);
    if (cached) {
      return { ok: true, filename: cached.filename, text: cached.text };
    }
    const win = this.windows.get(pageId);
    const token = await this.discordToken();
    if (!win || !token) {
      return { ok: false, message: 'Review page is not ready' };
    }
    let found: DiscordMessage | undefined;
    for (const bucket of win.threads.values()) {
      found = bucket.replies.find((item) => item.id === messageId);
      if (found) {
        break;
      }
    }
    const attachment = found ? reviewAttachment(found) : undefined;
    if (!found || !attachment) {
      return { ok: false, message: 'Review file is not attached to this message' };
    }
    const downloaded = await fetchAttachmentText(token, attachment.url);
    if (!downloaded.ok) {
      return { ok: false, message: downloaded.message || 'Could not download the review file' };
    }
    const value = { filename: attachment.filename, text: downloaded.value };
    this.fileCache.set(messageId, value);
    return { ok: true, filename: value.filename, text: value.text };
  }

  /** Write the cached attachment to a temp file and open it in an editor tab. */
  async openReviewAttachmentTab(
    pageId: string,
    messageId: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const read = await this.readReviewAttachment(pageId, messageId);
    if (!read.ok) {
      return read;
    }
    const safe = read.filename.replace(/[^\w.\-]+/g, '_') || 'review.md';
    const dir = path.join(os.tmpdir(), 'syn3-reviews');
    await fs.mkdir(dir, { recursive: true });
    const full = path.join(dir, `${messageId}-${safe}`);
    await fs.writeFile(full, read.text, 'utf8');
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(full));
    await vscode.window.showTextDocument(doc, {
      preview: false,
      viewColumn: vscode.ViewColumn.Beside,
    });
    return { ok: true };
  }

  async startOrSendReview(
    pageId: string,
    messageId: string,
    kind: ReviewKind,
  ): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'fileFail'; message: string }
    | { kind: 'error'; message: string }
  > {
    const win = this.windows.get(pageId);
    const access = await this.getAccess(pageId);
    const token = await this.discordToken();
    if (!win || !access || !token) {
      return { kind: 'error', message: 'Review page is not ready' };
    }
    const parent = win.messages.find((m) => m.id === messageId);
    if (!parent || !isMrMessage(parent.content)) {
      return { kind: 'error', message: 'Select an MR_SYN3 chip' };
    }
    const parsed = parseMrChip(parent.content);
    if (!parsed.webUrl) {
      return { kind: 'error', message: 'MR chip has no web_url' };
    }

    const existing = await this.pending.read();
    if (existing && existing.webUrl === parsed.webUrl) {
      return this.sendPendingReview(pageId, parent, existing.fsPath);
    }
    if (existing) {
      await deleteReviewFile(existing.fsPath);
      await this.pending.clear();
    }

    const paths = this.profilePaths();
    if (!paths.skillPath) {
      return { kind: 'error', message: 'Review skill path is not set in the active profile' };
    }
    if (!paths.dirPath) {
      return { kind: 'error', message: 'Review directory path is not set in the active profile' };
    }

    const threadId = parent.thread?.id;
    let reviewCount = 0;
    if (threadId) {
      const entry = win.threads.get(threadId);
      if (entry) {
        reviewCount = entry.replies.filter((r) => isReviewMessage(r.content)).length;
      } else {
        const listed = await listThreadMessages(token, threadId, { limit: 100 });
        if (listed.ok) {
          reviewCount = listed.value.filter((r) => isReviewMessage(r.content)).length;
        }
      }
    }
    const reviewNumber = reviewCount + 1;
    const title = parsed.title || 'MR';
    const dirAbs = path.isAbsolute(paths.dirPath)
      ? paths.dirPath
      : path.join(this.cwd(), paths.dirPath);
    const skillAbs = path.isAbsolute(paths.skillPath)
      ? paths.skillPath
      : path.join(this.cwd(), paths.skillPath);

    const agent = await runReviewSkill({
      cwd: this.cwd(),
      skillPath: skillAbs,
      model: paths.model,
      kind,
      reviewNumber,
      title,
      webUrl: parsed.webUrl,
    });
    if (!agent.ok) {
      return { kind: 'error', message: agent.message };
    }

    const mrIid = (() => {
      const m = parsed.webUrl.match(/\/(?:merge_requests|pull)\/(\d+)/);
      return m ? m[1] : '';
    })();
    const mrLine = [mrIid, title, parsed.webUrl].filter(Boolean).join(' ');
    try {
      const filePath = await writeReviewFile({
        dirPath: dirAbs,
        reviewNumber,
        mrLine,
        severity: agent.severity,
        body: agent.body,
      });
      await this.pending.write(parsed.webUrl, kind, filePath);
      const sent = await this.sendPendingReview(pageId, parent, filePath);
      if (sent.kind === 'state') {
        agent.report('Сообщение опубликовано в треде.', true);
      } else {
        agent.report(sent.message, false);
      }
      return sent;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      agent.report(message, false);
      return { kind: 'error', message };
    }
  }

  async retryReviewFile(pageId: string, messageId: string): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'fileFail'; message: string }
    | { kind: 'error'; message: string }
  > {
    const win = this.windows.get(pageId);
    const pending = await this.pending.read();
    if (!win || !pending) {
      return { kind: 'error', message: 'No pending review file' };
    }
    const parent = win.messages.find((m) => m.id === messageId);
    if (!parent) {
      return { kind: 'error', message: 'MR message not found on the map' };
    }
    return this.sendPendingReview(pageId, parent, pending.fsPath);
  }

  private async sendPendingReview(
    pageId: string,
    parent: DiscordMessage,
    filePath: string,
  ): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'fileFail'; message: string }
    | { kind: 'error'; message: string }
  > {
    const access = await this.getAccess(pageId);
    const token = await this.discordToken();
    if (!access || !token) {
      return { kind: 'error', message: 'Missing Discord access' };
    }
    const thread = await ensureThread(token, access.channelId, parent, 'reviews');
    if (!thread.ok) {
      return { kind: 'fileFail', message: thread.message };
    }
    parent.thread = { id: thread.value };
    const paths = this.profilePaths();
    let reviewNumber = 1;
    let severity = 'H:0 | M:0 | L:0';
    try {
      const fileText = await fs.readFile(filePath, 'utf8');
      const parsedFile = parseReviewAttachment(fileText);
      if (parsedFile.reviewNumber) {
        reviewNumber = parsedFile.reviewNumber;
      }
      if (parsedFile.severity) {
        severity = parsedFile.severity;
      }
    } catch {
      // keep defaults
    }
    const content = formatReviewDiscordBody({
      reviewNumber,
      severity,
      model: paths.model,
      skillPath: paths.skillPath,
    });
    const posted = await postMessageWithFile(token, thread.value, content, filePath);
    if (!posted.ok) {
      return { kind: 'fileFail', message: posted.message };
    }
    await this.pending.clear();
    await deleteReviewFile(filePath);
    const win = this.windows.get(pageId);
    if (win) {
      const idx = win.messages.findIndex((m) => m.id === parent.id);
      if (idx >= 0) {
        win.messages[idx] = {
          ...win.messages[idx],
          thread: { id: thread.value },
          hasThread: true,
        };
      }
      const listed = await listThreadMessages(token, thread.value, {
        limit: THREAD_INITIAL + THREAD_PROBE,
      });
      let replies = listed.ok ? sortMessagesAsc(listed.value) : [];
      if (!replies.some((item) => item.id === posted.value.id)) {
        replies = [...replies, posted.value];
      }
      const hasMore = replies.length > THREAD_INITIAL;
      const last = replies.slice(-THREAD_INITIAL);
      win.threads.set(thread.value, {
        replies: last,
        exhausted: !hasMore,
      });
      await this.enrichReplies(token, last);
    }
    return { kind: 'state', state: this.snapshot(pageId) };
  }
}
