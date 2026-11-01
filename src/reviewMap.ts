import * as vscode from 'vscode';
import {
  AccessPerson,
  AccessStore,
  ensureSecrets,
  findPerson,
  getSecret,
  personLabel,
  readOriginRepoUrl,
  repoUrlsMatch,
  ReviewPageAccess,
  SECRET_DISCORD,
  SECRET_GITHUB,
  SECRET_GITLAB,
  secretsStatus,
  storeSecrets,
} from './accessStore';
import {
  DiscordMessage,
  ensureThread,
  fetchAttachmentText,
  findMrMessage,
  formatMrDiscordBody,
  isMrMessage,
  listChannelMessages,
  listThreadMessages,
  parseMrChip,
  parseReviewAttachment,
  postChannelMessage,
  postMessageWithFile,
  REVIEW_PREFIX,
  sortMessagesAsc,
} from './discordApi';
import {
  collectMrTargetBranches,
  currentBranch,
  detectParentBranch,
  ensureBranchPushed,
  ensureCommittedBeforeMr,
} from './gitOps';
import { createMergeRequest, findOpenMrByBranch } from './gitlabApi';
import { createPullRequest, findOpenPrByBranch } from './githubApi';
import { LINK_PALETTE_DEFAULT, randomLinkPaletteColor } from './linkPalette';
import {
  detectProviderFromRepoUrl,
  mrThreadName,
  providerMatchesRepo,
  ReviewHostProvider,
  ReviewMr,
} from './reviewHost';
import { deleteReviewFile, runReviewSkill, writeReviewFile } from './reviewAgent';
import { ReviewKind, ReviewPendingStore } from './reviewPending';
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
  /** Thread replies were fetched for this parent (MR auto or plain expand). */
  repliesLoaded?: boolean;
  contentMissing?: boolean;
}

export interface ReviewPageState {
  pageId: string;
  loading: boolean;
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

function toReplyBase(msg: DiscordMessage): ReviewThreadMsg {
  return {
    id: msg.id,
    content: msg.content,
    author: msg.author,
    timestamp: msg.timestamp,
    isReview: msg.content.trimStart().startsWith(REVIEW_PREFIX),
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

export class ReviewMapController {
  private readonly access: AccessStore;
  private readonly pending: ReviewPendingStore;
  /** In-memory channel window per page. */
  private readonly windows = new Map<string, ReviewWindow>();
  private readonly loading = new Set<string>();
  private readonly errors = new Map<string, string>();
  /** Cached pill labels from attachment text, keyed by reply message id. */
  private readonly replyMeta = new Map<string, { isPill: boolean; pillLabel?: string }>();
  /** Plain parents whose thread was requested (even if empty). pageId → message ids. */
  private readonly plainExpanded = new Map<string, Set<string>>();

  constructor(
    private readonly root: vscode.Uri,
    private readonly secrets: vscode.SecretStorage,
    private readonly profilePaths: () => ReviewProfilePaths = () => ({
      skillPath: '',
      dirPath: '',
      model: '',
    }),
  ) {
    this.access = new AccessStore(root);
    this.pending = new ReviewPendingStore(root);
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

  snapshot(pageId: string): ReviewPageState {
    const win = this.windows.get(pageId);
    const loading = this.loading.has(pageId);
    const error = this.errors.get(pageId);
    if (!win) {
      return {
        pageId,
        loading,
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
      const plainLoaded = this.plainExpanded.get(pageId)?.has(m.id) === true;
      const loaded = !!thread || plainLoaded;
      const hasMore = thread
        ? !thread.exhausted
        : isMrMessage(m.content) && (!!m.thread?.id || !!m.hasThread);
      return toChip(m, replies, hasMore, loaded);
    });
    const missingCount = messages.filter((m) => m.contentMissing).length;
    const contentBlocked =
      messages.length > 0 && missingCount >= Math.ceil(messages.length * 0.6);
    return {
      pageId,
      loading,
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

  private async hostToken(provider: ReviewHostProvider): Promise<string | undefined> {
    return getSecret(this.secrets, provider === 'github' ? SECRET_GITHUB : SECRET_GITLAB);
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
        return this.snapshot(pageId);
      }
      if (!token) {
        this.errors.set(pageId, 'Discord bot token is missing');
        this.windows.delete(pageId);
        return this.snapshot(pageId);
      }
      // Tip: visible + 1 older probe. No newer probe — we are at the channel tip.
      const result = await listChannelMessages(token, access.channelId, {
        limit: CHANNEL_FETCH_SIDE,
      });
      if (!result.ok) {
        this.errors.set(pageId, result.message || 'ошибка синхронизации с discord');
        this.windows.delete(pageId);
        return this.snapshot(pageId);
      }
      const sliced = windowFromChannelTip(result.value);
      const win: ReviewWindow = {
        ...sliced,
        threads: new Map<string, { replies: DiscordMessage[]; exhausted: boolean }>(),
        focusMessageId: undefined,
      };
      this.windows.set(pageId, win);
      await this.prefetchThreads(token, win);
      return this.snapshot(pageId);
    } finally {
      this.loading.delete(pageId);
    }
  }

  private async enrichReplies(token: string, replies: DiscordMessage[]): Promise<void> {
    for (const msg of replies) {
      if (this.replyMeta.has(msg.id)) {
        continue;
      }
      if (!msg.content.trimStart().startsWith(REVIEW_PREFIX) || !msg.attachments?.length) {
        this.replyMeta.set(msg.id, { isPill: false });
        continue;
      }
      const file = await fetchAttachmentText(token, msg.attachments[0].url);
      if (!file.ok) {
        this.replyMeta.set(msg.id, { isPill: false });
        continue;
      }
      const parsed = parseReviewAttachment(file.value);
      if (parsed.pillLabel) {
        this.replyMeta.set(msg.id, { isPill: true, pillLabel: parsed.pillLabel });
      } else {
        this.replyMeta.set(msg.id, { isPill: false });
      }
    }
  }

  private async prefetchThreads(token: string, win: ReviewWindow): Promise<void> {
    let first = true;
    for (const msg of win.messages) {
      // Autoload threads only for MR parents that already have a thread.
      if (!isMrMessage(msg.content)) {
        continue;
      }
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
        return this.snapshot(pageId);
      }
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
      return this.snapshot(pageId);
    } finally {
      this.loading.delete(pageId);
    }
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
        return this.snapshot(pageId);
      }
      const known = new Set(entry.replies.map((m) => m.id));
      const fetched = sortMessagesAsc(result.value).filter((m) => !known.has(m.id));
      const hasMore = fetched.length > pageSize;
      const toAdd = hasMore ? fetched.slice(-pageSize) : fetched;
      entry.replies = sortMessagesAsc([...toAdd, ...entry.replies]);
      entry.exhausted = !hasMore;
      await this.enrichReplies(token, toAdd);
      return this.snapshot(pageId);
    } finally {
      this.loading.delete(pageId);
    }
  }

  /**
   * Expand a plain (non-MR) channel message: ensure/load its thread (last 5 + probe).
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
      let expanded = this.plainExpanded.get(pageId);
      if (!expanded) {
        expanded = new Set();
        this.plainExpanded.set(pageId, expanded);
      }
      expanded.add(parent.id);
      if (!threadId) {
        return this.snapshot(pageId);
      }
      if (win.threads.has(threadId)) {
        return this.snapshot(pageId);
      }
      const result = await listThreadMessages(token, threadId, {
        limit: THREAD_PAGE + THREAD_PROBE,
      });
      if (!result.ok) {
        this.errors.set(pageId, result.message || 'ошибка синхронизации с discord');
        return this.snapshot(pageId);
      }
      const sorted = sortMessagesAsc(result.value);
      const hasMore = sorted.length > THREAD_PAGE;
      const last = sorted.slice(-THREAD_PAGE);
      win.threads.set(threadId, { replies: last, exhausted: !hasMore });
      await this.enrichReplies(token, last);
      return this.snapshot(pageId);
    } finally {
      this.loading.delete(pageId);
    }
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
        return this.snapshot(pageId);
      }
      const sliced = windowAroundMessage(result.value, messageId);
      const win: ReviewWindow = {
        ...sliced,
        threads: new Map<string, { replies: DiscordMessage[]; exhausted: boolean }>(),
        focusMessageId: messageId,
      };
      this.windows.set(pageId, win);
      await this.prefetchThreads(token, win);
      return this.snapshot(pageId);
    } finally {
      this.loading.delete(pageId);
    }
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
      }
    | { error: string }
  > {
    const origin = await readOriginRepoUrl(this.cwd());
    if (!origin) {
      return { error: 'git remote origin not found' };
    }
    const status = await secretsStatus(this.secrets);
    return {
      origin,
      suggestedProvider: detectProviderFromRepoUrl(origin),
      hasGitlab: status.hasGitlab,
      hasGithub: status.hasGithub,
      hasDiscord: status.hasDiscord,
    };
  }

  parsePeople(raw: string): AccessPerson[] {
    return raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const eq = part.indexOf('=');
        if (eq === -1) {
          return { nick: part.replace(/^@/, '') };
        }
        return {
          nick: part.slice(0, eq).trim().replace(/^@/, ''),
          name: part.slice(eq + 1).trim() || undefined,
        };
      })
      .filter((p) => p.nick);
  }

  async applyCreatePageSecrets(opts: {
    provider: ReviewHostProvider;
    gitlabToken?: string;
    githubToken?: string;
    discordToken?: string;
  }): Promise<{ ok: true } | { ok: false; message: string }> {
    await storeSecrets(this.secrets, {
      gitlab: opts.gitlabToken,
      github: opts.githubToken,
      discord: opts.discordToken,
    });
    const tokens = await ensureSecrets(this.secrets, opts.provider);
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

  private displayPeople(nicks: string[], roster: AccessPerson[]): string[] {
    return nicks.map((nick) => {
      const person = findPerson(roster, nick);
      return person ? personLabel(person) : nick;
    });
  }

  private async postMrToDiscord(
    access: ReviewPageAccess,
    mr: ReviewMr,
  ): Promise<{ ok: true; message: DiscordMessage } | { ok: false; message: string }> {
    const token = await this.discordToken();
    if (!token) {
      return { ok: false, message: 'Discord bot token is missing' };
    }
    const authorNick = mr.author.username;
    const authorPerson = findPerson(access.people, authorNick);
    const body = formatMrDiscordBody({
      webUrl: mr.web_url,
      title: mr.title,
      draft: mr.draft,
      color: randomLinkPaletteColor(),
      authorNick,
      authorName: authorPerson?.name || mr.author.name,
      reviewers: this.displayPeople(
        mr.reviewers.map((r) => r.username),
        access.people,
      ),
      assignees: this.displayPeople(
        mr.assignees.map((a) => a.username),
        access.people,
      ),
    });
    const posted = await postChannelMessage(token, access.channelId, body);
    if (!posted.ok) {
      return { ok: false, message: posted.message };
    }
    const thread = await ensureThread(
      token,
      access.channelId,
      posted.value,
      mrThreadName(access.provider, mr.iid),
    );
    if (!thread.ok) {
      // Message exists; still treat post as success for chip, but surface thread error softly.
      return { ok: true, message: posted.value };
    }
    posted.value.thread = { id: thread.value };
    return { ok: true, message: posted.value };
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
        people: AccessPerson[];
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
      return {
        kind: 'needPanel',
        branches,
        parent,
        people: access.people,
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
    await this.loadInitial(pageId);
    const win = this.windows.get(pageId);
    if (win) {
      win.focusMessageId = posted.message.id;
      // If the new message is not in the last 5, jump to it.
      if (!win.messages.some((m) => m.id === posted.message.id)) {
        return { kind: 'state', state: await this.jumpAroundMessage(pageId, posted.message.id) };
      }
    }
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
    await this.loadInitial(pageId);
    const win = this.windows.get(pageId);
    if (win) {
      win.focusMessageId = posted.message.id;
      if (!win.messages.some((m) => m.id === posted.message.id)) {
        return { kind: 'state', state: await this.jumpAroundMessage(pageId, posted.message.id) };
      }
    }
    return { kind: 'state', state: this.snapshot(pageId) };
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
        reviewCount = entry.replies.filter((r) =>
          r.content.trimStart().startsWith(REVIEW_PREFIX),
        ).length;
      } else {
        const listed = await listThreadMessages(token, threadId, { limit: 100 });
        if (listed.ok) {
          reviewCount = listed.value.filter((r) =>
            r.content.trimStart().startsWith(REVIEW_PREFIX),
          ).length;
        }
      }
    }
    const reviewNumber = reviewCount + 1;
    const title = parsed.title || parent.content.split('\n')[2] || 'MR';
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
    const filePath = await writeReviewFile({
      dirPath: dirAbs,
      reviewNumber,
      mrLine,
      severity: agent.severity,
      body: agent.body,
    });
    await this.pending.write(parsed.webUrl, kind, filePath);
    return this.sendPendingReview(pageId, parent, filePath);
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
    const posted = await postMessageWithFile(
      token,
      thread.value,
      `${REVIEW_PREFIX}\n`,
      filePath,
    );
    if (!posted.ok) {
      return { kind: 'fileFail', message: posted.message };
    }
    await this.pending.clear();
    await deleteReviewFile(filePath);
    const win = this.windows.get(pageId);
    if (win) {
      const idx = win.messages.findIndex((m) => m.id === parent.id);
      if (idx >= 0) {
        win.messages[idx] = { ...win.messages[idx], thread: { id: thread.value } };
      }
      const replies = await listThreadMessages(token, thread.value, {
        limit: THREAD_INITIAL + THREAD_PROBE,
      });
      if (replies.ok) {
        const sorted = sortMessagesAsc(replies.value);
        const hasMore = sorted.length > THREAD_INITIAL;
        const last = sorted.slice(-THREAD_INITIAL);
        win.threads.set(thread.value, {
          replies: last,
          exhausted: !hasMore,
        });
        await this.enrichReplies(token, last);
      }
    }
    return { kind: 'state', state: this.snapshot(pageId) };
  }
}
