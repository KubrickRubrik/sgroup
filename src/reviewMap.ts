import * as vscode from 'vscode';
import {
  AccessStore,
  ensureSecrets,
  getSecret,
  readOriginRepoUrl,
  readProfileHostToken,
  readRepositoryToken,
  repoUrlsMatch,
  ReviewPageAccess,
  SECRET_DISCORD,
  storeSecrets,
} from './accessStore';
import {
  DiscordError,
  DiscordMessage,
  editChannelMessage,
  ensureThread,
  EXPLAIN_DEFAULT_COLOR,
  EXPLAIN_TITLE,
  findMrMessage,
  formatExplainDiscordBody,
  formatMrDiscordBody,
  formatReviewDiscordBody,
  getChannelMessage,
  isConfigMessage,
  isDiscordSystemNotice,
  isExplainMessage,
  isMrMessage,
  isReviewMessage,
  listChannelMessages,
  listThreadMessages,
  parseDiscordLock,
  parseExplainMessagePill,
  parseMrChip,
  parseReviewAttachment,
  parseReviewBranch,
  parseReviewColor,
  parseReviewMessagePill,
  parseReviewFixes,
  deleteChannelMessage,
  emptyFixBullets,
  formatFixStamp,
  formatSeverityLine,
  parseReviewStatus,
  fetchAttachmentText,
  postChannelMessage,
  postMessageWithFile,
  replaceDiscordLock,
  replaceMrDiscordColor,
  replaceMrDiscordHead,
  replaceMrDiscordStatus,
  replaceReviewDiscordStatus,
  ReviewChipStatus,
  ReviewFixState,
  writeReviewFixes,
  sortMessagesAsc,
  THREAD_STARTER_MESSAGE,
} from './discordApi';
import { ExplainPendingStore } from './explainPending';
import {
  collectMrTargetBranches,
  currentBranch,
  detectParentBranch,
  ensureBranchPushed,
  ensureCommittedBeforeMr,
  worktreeFingerprint,
} from './gitOps';
import {
  closeMergeRequest,
  compareGitlabBranches,
  createMergeRequest,
  findGitlabParentBranch,
  findOpenMrByBranch,
  listGitlabBranches,
  listGitlabOpenMrs,
  updateMergeRequest,
  type HostCompare,
} from './gitlabApi';
import {
  closePullRequest,
  compareGithubBranches,
  createPullRequest,
  findGithubParentBranch,
  findOpenPrByBranch,
  listGithubBranches,
  listGithubOpenPrs,
  updatePullRequest,
} from './githubApi';
import { LINK_PALETTE_DEFAULT, randomLinkPaletteColor } from './linkPalette';
import { normalizeHex } from './palette';
import {
  detectProviderFromRepoUrl,
  type HostOpenRequest,
  providerMatchesRepo,
  ReviewHostProvider,
  ReviewMr,
} from './reviewHost';
import {
  deleteReviewFile,
  hasNeuroFixSuccessMarker,
  NEUROFIX_OK_LINE,
  parseReviewFixGroups,
  reviewFixRows,
  runExplainSkill,
  runNeuroFixSkill,
  runReviewSkill,
  writeExplainFile,
  writeReviewFile,
} from './reviewAgent';
import {
  isPendingBranchKey,
  parseReviewDepth,
  pendingBranchKey,
  reviewDepthToken,
  reviewScopeToken,
  ReviewDepth,
  ReviewKind,
  ReviewPendingStore,
} from './reviewPending';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export interface ReviewThreadMsg {
  id: string;
  content: string;
  author?: string;
  timestamp: string;
  isReview: boolean;
  /** Thread reply W_SYN3 («Что сделано»). */
  isExplain?: boolean;
  /** True when attachment parsed to a review pill with H/M/S. */
  isPill?: boolean;
  /** Label for the review pill, e.g. `Ревью 1 | branch | rd | H:4 | M:4 | L:5`. */
  pillLabel?: string;
  /** `fixes:` / `bullet:` on this R_SYN3 message. Absent until the line is written. */
  fixes?: ReviewFixState;
  /** Empty when Discord `status` is `-` or missing. */
  status?: ReviewChipStatus;
  /** Chip color from `color:` on an explain reply. */
  color?: string;
  /** Branch from `Branch:` on an explain reply. */
  branch?: string;
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
  /** Channel-root R_SYN3 (no MR). */
  isReviewRoot?: boolean;
  /** Channel-root W_SYN3 («Что сделано»). */
  isExplainRoot?: boolean;
  webUrl?: string;
  title?: string;
  draft?: boolean;
  color?: string;
  /** Pill label for a root review, e.g. `Ревью 1 | branch | rd | H:4 | M:4 | L:5`. */
  pillLabel?: string;
  /** `fixes:` / `bullet:` on a root R_SYN3 message. */
  fixes?: ReviewFixState;
  /** `status: closed` on the Discord MR message. Missing line stays open. */
  status?: 'open' | 'closed';
  /** `status:` on a root R_SYN3 message. */
  reviewStatus?: ReviewChipStatus;
  /** Discord attachment on a root review. */
  hasFile?: boolean;
  filename?: string;
  /** `lock: true` on the parent Discord message. Missing line stays open. */
  locked?: boolean;
  /** Branch this channel message was made on, from `Branch:`. */
  branch?: string;
  threadId?: string;
  hasThread?: boolean;
  replies: ReviewThreadMsg[];
  repliesHasMore: boolean;
  /** More replies exist after the loaded thread span. */
  repliesHasNewer?: boolean;
  /** Loaded replies skip Discord history immediately before this reply id. */
  gapBeforeReplyId?: string;
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
  /** Channel history is missing immediately before this message id. */
  gapBeforeMessageId?: string;
  focusMessageId?: string;
  /** Placeholder MR chip while the host request and the Discord post are in flight. */
  pendingMr?: { title: string; draft: boolean };
  /** Placeholder root review while the agent and Discord post are in flight. */
  pendingRoot?: { branch: string };
  /** Parent message whose thread shows a review pill until Discord posts it. */
  pendingReviewId?: string;
  /** Placeholder root explain while the agent and Discord post are in flight. */
  pendingExplainRoot?: { branch: string };
  /** Parent message whose thread shows an explain pill until Discord posts it. */
  pendingExplainId?: string;
  /** Review message whose thread shows a neurofix chip until the agent finishes. */
  pendingNeurofixId?: string;
  /** Bumps when a placeholder starts or ends. Older snapshots stay behind this. */
  skeletonSeq?: number;
  /** Branch checked out in this window. Empty when git has no branch name. */
  checkout?: string;
}

function toChip(
  msg: DiscordMessage,
  replies: ReviewThreadMsg[] = [],
  repliesHasMore = false,
  repliesLoaded = false,
): ReviewChip {
  const isMr = isMrMessage(msg.content);
  const isReviewRoot = !isMr && isReviewMessage(msg.content);
  const isExplainRoot = !isMr && !isReviewRoot && isExplainMessage(msg.content);
  const parsed = isMr ? parseMrChip(msg.content) : {};
  const file = isReviewRoot || isExplainRoot ? reviewAttachment(msg) : undefined;
  return {
    id: msg.id,
    content: msg.content,
    author: msg.author,
    timestamp: msg.timestamp,
    isMr,
    isReviewRoot,
    isExplainRoot,
    webUrl: parsed.webUrl,
    title: isMr
      ? parsed.title
      : isReviewRoot || isExplainRoot
        ? parseReviewBranch(msg.content)
        : undefined,
    draft: parsed.draft,
    color:
      parsed.color ||
      (isReviewRoot || isExplainRoot ? parseReviewColor(msg.content) : undefined) ||
      (isExplainRoot ? EXPLAIN_DEFAULT_COLOR : undefined) ||
      (isMr ? LINK_PALETTE_DEFAULT : undefined),
    pillLabel: isReviewRoot
      ? parseReviewMessagePill(msg.content)
      : isExplainRoot
        ? parseExplainMessagePill(msg.content)
        : undefined,
    status: isMr ? (parsed.status === 'closed' ? 'closed' : 'open') : undefined,
    reviewStatus: isReviewRoot ? parseReviewStatus(msg.content) : undefined,
    hasFile: !!file,
    filename: file?.filename,
    locked: parseDiscordLock(msg.content),
    branch: parseReviewBranch(msg.content),
    fixes: isReviewRoot ? parseReviewFixes(msg.content) : undefined,
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
  const explain = isExplainMessage(msg.content);
  return {
    id: msg.id,
    content: msg.content,
    author: msg.author,
    timestamp: msg.timestamp,
    isReview: isReviewMessage(msg.content),
    isExplain: explain,
    status: isReviewMessage(msg.content) ? parseReviewStatus(msg.content) : undefined,
    color: explain ? parseReviewColor(msg.content) || EXPLAIN_DEFAULT_COLOR : undefined,
    branch: explain ? parseReviewBranch(msg.content) : undefined,
    hasFile: !!file,
    filename: file?.filename,
    fixes: isReviewMessage(msg.content) ? parseReviewFixes(msg.content) : undefined,
    contentMissing: msg.contentMissing,
  };
}

/** Messages shown on the map. */
const CHANNEL_VISIBLE = 5;
/** Extra message fetched on a side to know if a load button is needed (no total from Discord). */
const CHANNEL_PROBE = 1;
/** One-sided fetch: visible page + one probe. */
const CHANNEL_FETCH_SIDE = CHANNEL_VISIBLE + CHANNEL_PROBE;
/** Around-target fetch: 4 before + target + 4 after. The 4th on each side is only a probe. */
const JUMP_SIDE = 3;
const JUMP_FETCH = JUMP_SIDE + 1 + 1 + JUMP_SIDE + 1;
/** Initial MR thread window. */
const THREAD_INITIAL = 3;
/** Thread page size when loading more / plain expand. */
const THREAD_PAGE = 5;
/** Extra slot so the type-21 starter can sit in the page without hiding a real reply. */
const THREAD_PROBE = 1;
/** Shown channel messages. Further loads trim the opposite edge back to this. */
const CHANNEL_CAP = 20;
/** Shown replies in one thread. */
const THREAD_CAP = 10;
/** Extra Discord rows so system/config messages don't truncate a sync of the shown span. */
const SYNC_SLACK = 20;

type ThreadBucket = {
  replies: DiscordMessage[];
  /** Discord `message_count` for this thread, when the channel payload included it. */
  messageCount?: number;
  /** More replies exist before the oldest loaded reply. */
  canLoadOlder: boolean;
  /** More replies exist after the loaded span (a hole, or past a contiguous end). */
  canLoadNewer: boolean;
  /**
   * Own post kept at the live end while `replies` before this id do not reach it.
   * The id is the last reply.
   */
  gapBeforeId?: string;
};

type ReviewWindow = {
  messages: DiscordMessage[];
  threads: Map<string, ThreadBucket>;
  focusMessageId?: string;
  /** More history exists before the oldest message in the window. */
  canLoadOlder: boolean;
  /** More messages exist after the loaded span (a hole, or past a contiguous end). */
  canLoadNewer: boolean;
  /**
   * Own channel post kept at the live end while `messages` before this id do not reach it.
   * The id is the last message.
   */
  gapBeforeId?: string;
};

/** Config snapshots share the channel with MR chips — hide them from the tree. */
function isReviewChannelNoise(msg: DiscordMessage): boolean {
  return isDiscordSystemNotice(msg) || isConfigMessage(msg.content);
}

/** Discord includes this placeholder in the thread listing; `message_count` does not. */
function isThreadStarter(msg: DiscordMessage): boolean {
  return msg.type === THREAD_STARTER_MESSAGE;
}

/**
 * Newest `pageSize` real replies. «Load more» follows `message_count` when Discord
 * sent it. A short page means the listing is finished even if the count is higher.
 */
function takeThreadPage(
  fetchedAsc: DiscordMessage[],
  pageSize: number,
  messageCount: number | undefined,
  already: DiscordMessage[],
): { toAdd: DiscordMessage[]; exhausted: boolean; messageCount: number | undefined } {
  const known = new Set(already.map((msg) => msg.id));
  const real = fetchedAsc.filter(
    (msg) => !isThreadStarter(msg) && !isReviewChannelNoise(msg) && !known.has(msg.id),
  );
  const overflow = real.length > pageSize;
  const toAdd = overflow ? real.slice(-pageSize) : real;
  const loaded = already.length + toAdd.length;
  const shortPage = fetchedAsc.length < pageSize + THREAD_PROBE;
  if (typeof messageCount === 'number') {
    return {
      toAdd,
      exhausted: loaded >= messageCount || shortPage,
      messageCount: shortPage ? Math.min(messageCount, loaded) : messageCount,
    };
  }
  return { toAdd, exhausted: !overflow, messageCount: undefined };
}

function threadHasMore(parent: DiscordMessage, bucket: ThreadBucket | undefined): boolean {
  if (!bucket) {
    return !!(parent.thread?.id || parent.hasThread);
  }
  return bucket.canLoadOlder;
}

function snowflakeBefore(id: string): string {
  try {
    return (BigInt(id) - 1n).toString();
  } catch {
    return id;
  }
}

function snowflakeLess(a: string, b: string): boolean {
  try {
    return BigInt(a) < BigInt(b);
  } catch {
    return a < b;
  }
}

function isVisibleChannel(msg: DiscordMessage): boolean {
  return !isReviewChannelNoise(msg);
}

function isVisibleReply(msg: DiscordMessage): boolean {
  return !isThreadStarter(msg) && !isReviewChannelNoise(msg);
}

/** Messages strictly before the hole. The whole list, when there is no hole. */
function spanBeforeGap(messages: DiscordMessage[], gapBeforeId?: string): DiscordMessage[] {
  if (!gapBeforeId) {
    return messages;
  }
  const idx = messages.findIndex((msg) => msg.id === gapBeforeId);
  return idx < 0 ? messages : messages.slice(0, idx);
}

function trimToCap<T extends { id: string }>(
  items: T[],
  cap: number,
  drop: 'oldest' | 'newest',
  protect?: Set<string>,
): T[] {
  const next = items.slice();
  while (next.length > cap) {
    if (drop === 'oldest') {
      const idx = next.findIndex((item) => !protect?.has(item.id));
      if (idx < 0) {
        break;
      }
      next.splice(idx, 1);
    } else {
      next.pop();
    }
  }
  return next;
}

/**
 * Refresh texts already on screen. Unknown ids stay out.
 * A missing id is a deletion only when the fetch covered the newest shown id.
 */
function applyShownSync(
  loaded: DiscordMessage[],
  fetchedAsc: DiscordMessage[],
  visible: (msg: DiscordMessage) => boolean,
  reachedEnd: boolean,
): DiscordMessage[] {
  if (loaded.length === 0) {
    return loaded;
  }
  const byId = new Map(fetchedAsc.filter(visible).map((msg) => [msg.id, msg]));
  const newestId = loaded[loaded.length - 1].id;
  const covered =
    byId.has(newestId) ||
    reachedEnd ||
    fetchedAsc.some((msg) => snowflakeLess(newestId, msg.id));
  const merge = (prev: DiscordMessage, next: DiscordMessage): DiscordMessage => ({
    ...next,
    thread: next.thread ?? prev.thread,
    hasThread: next.hasThread || prev.hasThread,
  });
  if (!covered) {
    return loaded.map((msg) => {
      const next = byId.get(msg.id);
      return next ? merge(msg, next) : msg;
    });
  }
  return loaded.filter((msg) => byId.has(msg.id)).map((msg) => merge(msg, byId.get(msg.id)!));
}

/**
 * Tip of the channel: newest messages. Fetch visible+1; drop the oldest as older-probe.
 * Nothing newer exists at the tip.
 */
function windowFromChannelTip(fetchedAsc: DiscordMessage[]): Pick<
  ReviewWindow,
  'messages' | 'canLoadOlder' | 'canLoadNewer'
> {
  const sorted = sortMessagesAsc(fetchedAsc);
  const visible = sorted.filter((msg) => !isReviewChannelNoise(msg));
  if (sorted.length > CHANNEL_VISIBLE) {
    return {
      messages: visible.slice(-CHANNEL_VISIBLE),
      canLoadOlder: true,
      canLoadNewer: false,
    };
  }
  return {
    messages: visible,
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
  const visible = batchAsc.filter((msg) => !isReviewChannelNoise(msg));
  if (batchAsc.length > CHANNEL_VISIBLE) {
    return {
      toAdd: visible.slice(-CHANNEL_VISIBLE),
      canLoadOlder: true,
    };
  }
  return { toAdd: visible, canLoadOlder: false };
}

/**
 * Newer batch fetched with `after`. Keep the oldest `CHANNEL_VISIBLE` (closest to
 * the open window); an extra newest item is the probe.
 */
function takeNewerPage(batchAsc: DiscordMessage[]): {
  toAdd: DiscordMessage[];
  canLoadNewer: boolean;
} {
  const visible = batchAsc.filter((msg) => !isReviewChannelNoise(msg));
  if (batchAsc.length > CHANNEL_VISIBLE) {
    return {
      toAdd: visible.slice(0, CHANNEL_VISIBLE),
      canLoadNewer: true,
    };
  }
  return { toAdd: visible, canLoadNewer: false };
}

/**
 * Jump window: up to 3 before + target + 3 after. A 4th message on either side
 * of the same fetch is only the probe for the load button.
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
  const beforeAll = sorted.slice(0, idx).filter(isVisibleChannel);
  const afterAll = sorted.slice(idx + 1).filter(isVisibleChannel);
  const showBefore = beforeAll.slice(-JUMP_SIDE);
  const showAfter = afterAll.slice(0, JUMP_SIDE);
  const target = sorted[idx];
  return {
    messages: [...showBefore, target, ...showAfter].filter(
      (msg) => msg.id === messageId || isVisibleChannel(msg),
    ),
    canLoadOlder: beforeAll.length > showBefore.length,
    canLoadNewer: afterAll.length > showAfter.length,
  };
}

function mrIidFromWebUrl(webUrl: string): number | undefined {
  const match = /\/merge_requests\/(\d+)\b|\/pull\/(\d+)\b/.exec(webUrl);
  const raw = match?.[1] || match?.[2];
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export type ReviewProfilePaths = {
  skillPath: string;
  /** Path to the Neurofix skill. Empty → fix runs without a skill file. */
  fixSkillPath: string;
  /** Path to the «Что сделано» skill. Empty → explain will not start. */
  explainSkillPath: string;
  dirPath: string;
  model: string;
  fixModel: string;
  printThinking: boolean;
  printTools: boolean;
};

export type NeuroFixScope = 'H' | 'M' | 'L' | 'all';

/** `S` from an older client is Low. */
export function normalizeNeuroFixScope(scope: string): NeuroFixScope | undefined {
  if (scope === 'H' || scope === 'M' || scope === 'L' || scope === 'all') {
    return scope;
  }
  if (scope === 'S') {
    return 'L';
  }
  return undefined;
}

export type ReviewProfileContext = ReviewProfilePaths & {
  profileId: string;
  profileName: string;
  githubNick: string;
  gitlabNick: string;
  repositoryTokenKey?: string;
};

export class ReviewMapController {
  private readonly access: AccessStore;
  private readonly pending: ReviewPendingStore;
  private readonly explainPending: ExplainPendingStore;
  /** True while a review, explain, or neurofix agent run holds a skeleton. */
  private agentBusy = false;
  /** In-memory channel window per page. */
  private readonly windows = new Map<string, ReviewWindow>();
  private readonly loading = new Set<string>();
  /** Channel fetch the map should show as skeletons. Depth covers overlapping loads. */
  private readonly loadEdge = new Map<string, { edge: ReviewLoadEdge; depth: number }>();
  private readonly errors = new Map<string, string>();
  /** MR chip placeholder for a page, while git and Discord are in flight. */
  private readonly mrSkeleton = new Map<string, { title: string; draft: boolean }>();
  /** Root review placeholder for a page, while the agent and Discord post are in flight. */
  private readonly rootSkeleton = new Map<string, { branch: string }>();
  /** Review pill placeholder: page id → parent Discord message id. */
  private readonly reviewSkeleton = new Map<string, string>();
  /** Root explain placeholder for a page. */
  private readonly explainRootSkeleton = new Map<string, { branch: string }>();
  /** Explain pill placeholder: page id → parent Discord message id. */
  private readonly explainSkeleton = new Map<string, string>();
  /** Neurofix chip placeholder: page id → review message id. */
  private readonly neurofixSkeleton = new Map<string, string>();
  /** Monotonic per page so the map can drop a snapshot from before the placeholder. */
  private readonly skeletonSeq = new Map<string, number>();
  /** Cached pill labels from message text, keyed by reply message id. */
  private readonly replyMeta = new Map<
    string,
    { isPill: boolean; pillLabel?: string; isExplain?: boolean; color?: string; branch?: string }
  >();
  /**
   * Channel last used to list a page when access.json has no channel.
   * A project switch pins the new review channel here before access is rewritten.
   */
  private readonly listedChannel = new Map<string, string>();
  /** Project review channel, used when the page has no access.json binding. */
  private reviewChannelFallback = '';
  /** Downloaded review attachments, keyed by Discord message id. */
  private readonly fileCache = new Map<string, { filename: string; text: string }>();

  constructor(
    private readonly root: vscode.Uri,
    private readonly secrets: vscode.SecretStorage,
    private readonly profileContext: () => ReviewProfileContext = () => ({
      skillPath: '',
      fixSkillPath: '',
      explainSkillPath: '',
      dirPath: '',
      model: '',
      fixModel: '',
      printThinking: false,
      printTools: true,
      profileId: 'general',
      profileName: '',
      githubNick: '',
      gitlabNick: '',
      repositoryTokenKey: '',
    }),
  ) {
    this.access = new AccessStore(root);
    this.pending = new ReviewPendingStore(root);
    this.explainPending = new ExplainPendingStore(root);
  }

  private profilePaths(): ReviewProfilePaths {
    const ctx = this.profileContext();
    return {
      skillPath: ctx.skillPath,
      fixSkillPath: ctx.fixSkillPath,
      explainSkillPath: ctx.explainSkillPath,
      dirPath: ctx.dirPath,
      model: ctx.model,
      fixModel: ctx.fixModel,
      printThinking: ctx.printThinking === true,
      printTools: ctx.printTools !== false,
    };
  }

  /** True while a review, explain, or neurofix agent skeleton is held. MR create ignores this. */
  isAgentBusy(): boolean {
    return this.agentBusy;
  }

  beginAgentBusy(): void {
    this.agentBusy = true;
  }

  endAgentBusy(): void {
    this.agentBusy = false;
  }

  accessStore(): AccessStore {
    return this.access;
  }

  cwd(): string {
    return this.root.fsPath;
  }

  /** Current git branch, with a review-oriented detached-HEAD message. */
  async peekCurrentBranch(): Promise<{ ok: true; value: string } | { ok: false; message: string }> {
    const branch = await currentBranch(this.cwd());
    if (!branch.ok) {
      return { ok: false, message: 'Detached HEAD — cannot start review' };
    }
    return branch;
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

  /** Show an MR chip placeholder before the host request and the Discord post. */
  beginMrSkeleton(pageId: string, title: string, draft: boolean): ReviewPageState {
    this.mrSkeleton.set(pageId, { title: this.mrSkeletonTitle(title), draft: !!draft });
    this.bumpSkeleton(pageId);
    return this.snapshot(pageId);
  }

  /**
   * Drop this operation's MR placeholder. A newer skeleton on the same page
   * keeps its chip and its sequence.
   */
  endMrSkeleton(pageId: string, title: string): ReviewPageState {
    const current = this.mrSkeleton.get(pageId);
    if (current && current.title === this.mrSkeletonTitle(title)) {
      this.mrSkeleton.delete(pageId);
      this.bumpSkeleton(pageId);
    }
    return this.snapshot(pageId);
  }

  /** Show a review pill in this parent's thread until the Discord reply arrives. */
  beginReviewSkeleton(pageId: string, messageId: string): ReviewPageState {
    this.reviewSkeleton.set(pageId, messageId);
    this.bumpSkeleton(pageId);
    return this.snapshot(pageId);
  }

  /**
   * Drop this operation's review pill. A newer messageId on the same page
   * keeps its pill and its sequence.
   */
  endReviewSkeleton(pageId: string, messageId: string): ReviewPageState {
    if (messageId && this.reviewSkeleton.get(pageId) === messageId) {
      this.reviewSkeleton.delete(pageId);
      this.bumpSkeleton(pageId);
    }
    return this.snapshot(pageId);
  }

  /** Show a root review placeholder before the agent and the Discord post. */
  beginRootSkeleton(pageId: string, branch: string): ReviewPageState {
    this.rootSkeleton.set(pageId, { branch: this.rootSkeletonBranch(branch) });
    this.bumpSkeleton(pageId);
    return this.snapshot(pageId);
  }

  /**
   * Drop this operation's root placeholder. A newer skeleton on the same page
   * keeps its chip and its sequence.
   */
  endRootSkeleton(pageId: string, branch: string): ReviewPageState {
    const current = this.rootSkeleton.get(pageId);
    if (current && current.branch === this.rootSkeletonBranch(branch)) {
      this.rootSkeleton.delete(pageId);
      this.bumpSkeleton(pageId);
    }
    return this.snapshot(pageId);
  }

  /** Show an explain pill in this parent's thread until the Discord reply arrives. */
  beginExplainSkeleton(pageId: string, messageId: string): ReviewPageState {
    this.explainSkeleton.set(pageId, messageId);
    this.bumpSkeleton(pageId);
    return this.snapshot(pageId);
  }

  endExplainSkeleton(pageId: string, messageId: string): ReviewPageState {
    if (messageId && this.explainSkeleton.get(pageId) === messageId) {
      this.explainSkeleton.delete(pageId);
      this.bumpSkeleton(pageId);
    }
    return this.snapshot(pageId);
  }

  /** Show a root explain placeholder before the agent and the Discord post. */
  beginExplainRootSkeleton(pageId: string, branch: string): ReviewPageState {
    this.explainRootSkeleton.set(pageId, { branch: this.rootSkeletonBranch(branch) });
    this.bumpSkeleton(pageId);
    return this.snapshot(pageId);
  }

  endExplainRootSkeleton(pageId: string, branch: string): ReviewPageState {
    const current = this.explainRootSkeleton.get(pageId);
    if (current && current.branch === this.rootSkeletonBranch(branch)) {
      this.explainRootSkeleton.delete(pageId);
      this.bumpSkeleton(pageId);
    }
    return this.snapshot(pageId);
  }

  /** Show the green fix chip under this review message until neurofix settles. */
  beginNeurofixSkeleton(pageId: string, messageId: string): ReviewPageState {
    this.neurofixSkeleton.set(pageId, messageId);
    this.bumpSkeleton(pageId);
    return this.snapshot(pageId);
  }

  endNeurofixSkeleton(pageId: string, messageId: string): ReviewPageState {
    if (messageId && this.neurofixSkeleton.get(pageId) === messageId) {
      this.neurofixSkeleton.delete(pageId);
      this.bumpSkeleton(pageId);
    }
    return this.snapshot(pageId);
  }

  private mrSkeletonTitle(title: string): string {
    return title.trim() || 'MR';
  }

  /** Chip placeholder while «Подтянуть» looks up the host MR and posts to Discord. Matches the map. */
  pullSkeletonTitle(): string {
    return '…';
  }

  private rootSkeletonBranch(branch: string): string {
    return branch.trim() || '—';
  }

  private bumpSkeleton(pageId: string): void {
    this.skeletonSeq.set(pageId, (this.skeletonSeq.get(pageId) ?? 0) + 1);
  }

  private skeletonFields(
    pageId: string,
  ): Pick<
    ReviewPageState,
    | 'pendingMr'
    | 'pendingRoot'
    | 'pendingReviewId'
    | 'pendingExplainRoot'
    | 'pendingExplainId'
    | 'pendingNeurofixId'
    | 'skeletonSeq'
  > {
    return {
      pendingMr: this.mrSkeleton.get(pageId),
      pendingRoot: this.rootSkeleton.get(pageId),
      pendingReviewId: this.reviewSkeleton.get(pageId),
      pendingExplainRoot: this.explainRootSkeleton.get(pageId),
      pendingExplainId: this.explainSkeleton.get(pageId),
      pendingNeurofixId: this.neurofixSkeleton.get(pageId),
      skeletonSeq: this.skeletonSeq.get(pageId) ?? 0,
    };
  }

  hasWindow(pageId: string): boolean {
    return this.windows.has(pageId);
  }

  /** Forget a channel window so the next open fetches again. */
  dropWindow(pageId: string): void {
    this.windows.delete(pageId);
    this.errors.delete(pageId);
    this.listedChannel.delete(pageId);
  }

  /** Forget every review window. The next open reads the current project channel. */
  dropAllWindows(): void {
    this.windows.clear();
    this.errors.clear();
    this.listedChannel.clear();
    this.loading.clear();
    this.loadEdge.clear();
    this.mrSkeleton.clear();
    this.reviewSkeleton.clear();
    this.explainRootSkeleton.clear();
    this.explainSkeleton.clear();
    this.neurofixSkeleton.clear();
  }

  /** Remember the project review channel so posts work without an access.json page row. */
  bindReviewChannel(channelId: string): void {
    this.reviewChannelFallback = channelId.trim();
  }

  /** Discord channel for listing this page: explicit override, then access, then the last list, then the project channel. */
  private async listingChannel(pageId: string, channelOverride?: string): Promise<string> {
    const accessChannel = (await this.getAccess(pageId))?.channelId?.trim() || '';
    const channel = (
      channelOverride ??
      (accessChannel || this.listedChannel.get(pageId) || this.reviewChannelFallback || '')
    ).trim();
    if (channel) {
      this.listedChannel.set(pageId, channel);
    } else {
      this.listedChannel.delete(pageId);
    }
    return channel;
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
        ...this.skeletonFields(pageId),
      };
    }
    const messages = win.messages.filter((m) => !isReviewChannelNoise(m)).map((m) => {
      const thread = m.thread?.id ? win.threads.get(m.thread.id) : undefined;
      const replies = (thread?.replies ?? []).filter((r) => isVisibleReply(r)).map((r) => {
        const base = toReplyBase(r);
        const meta = this.replyMeta.get(r.id);
        if (!meta) {
          return base;
        }
        return {
          ...base,
          isPill: meta.isPill,
          pillLabel: meta.pillLabel,
          isExplain: meta.isExplain || base.isExplain,
          color: meta.color || base.color,
          branch: meta.branch || base.branch,
        };
      });
      const loaded = !!thread;
      const hasMore = threadHasMore(m, thread);
      const chip = toChip(m, replies, hasMore, loaded);
      if (thread?.canLoadNewer) {
        chip.repliesHasNewer = true;
      }
      if (thread?.gapBeforeId) {
        chip.gapBeforeReplyId = thread.gapBeforeId;
      }
      return chip;
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
      gapBeforeMessageId: win.gapBeforeId,
      focusMessageId: win.focusMessageId,
      ...this.skeletonFields(pageId),
    };
  }

  private async discordToken(): Promise<string | undefined> {
    return getSecret(this.secrets, SECRET_DISCORD);
  }

  private profileId(): string {
    return this.profileContext().profileId || 'general';
  }

  private async hostToken(provider: ReviewHostProvider): Promise<string | undefined> {
    const key = this.profileContext().repositoryTokenKey;
    const byKey = key ? await readRepositoryToken(this.secrets, key) : undefined;
    if (byKey) {
      return byKey;
    }
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

  /**
   * A channel is already on screen. A later fetch that never left the machine
   * (no network) must not replace that window with the fetch error.
   */
  private hasLoadedContent(pageId: string): boolean {
    const win = this.windows.get(pageId);
    if (!win) {
      return false;
    }
    return win.messages.some((message) => isVisibleChannel(message));
  }

  private noteChannelError(pageId: string, result: DiscordError, dropWindow: boolean): void {
    if (result.status === 0 && this.hasLoadedContent(pageId)) {
      return;
    }
    this.errors.set(pageId, result.message || 'ошибка синхронизации с discord');
    if (dropWindow) {
      this.windows.delete(pageId);
    }
  }

  async loadInitial(pageId: string, channelOverride?: string): Promise<ReviewPageState> {
    this.loading.add(pageId);
    this.errors.delete(pageId);
    try {
      const channel = await this.listingChannel(pageId, channelOverride);
      const token = await this.discordToken();
      if (!channel) {
        this.errors.set(pageId, 'Review page access is not configured');
        this.windows.delete(pageId);
      } else if (!token) {
        this.errors.set(pageId, 'Discord bot token is missing');
        this.windows.delete(pageId);
      } else {
        // Tip: visible + 1 older probe. No newer probe — we are at the channel tip.
        const result = await listChannelMessages(token, channel, {
          limit: CHANNEL_FETCH_SIDE,
        });
        if (!result.ok) {
          this.noteChannelError(pageId, result, true);
        } else {
          const sliced = windowFromChannelTip(result.value);
          const win: ReviewWindow = {
            ...sliced,
            threads: new Map<string, ThreadBucket>(),
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
      const explainPill = parseExplainMessagePill(msg.content);
      if (explainPill) {
        this.replyMeta.set(msg.id, {
          isPill: true,
          pillLabel: explainPill,
          isExplain: true,
          color: parseReviewColor(msg.content) || EXPLAIN_DEFAULT_COLOR,
          branch: parseReviewBranch(msg.content),
        });
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
      const page = takeThreadPage(
        sortMessagesAsc(replies.value),
        THREAD_INITIAL,
        msg.thread?.messageCount,
        [],
      );
      win.threads.set(threadId, {
        replies: page.toAdd,
        messageCount: page.messageCount,
        canLoadOlder: !page.exhausted,
        canLoadNewer: false,
      });
      await this.enrichReplies(token, page.toAdd);
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
    const channel = await this.listingChannel(pageId);
    const token = await this.discordToken();
    if (!win || !channel || !token || win.messages.length === 0) {
      return this.snapshot(pageId);
    }
    this.loading.add(pageId);
    this.errors.delete(pageId);
    try {
      if (direction === 'newer' && win.gapBeforeId) {
        await this.fillChannelGap(pageId, token, channel, win);
      } else {
        const span = spanBeforeGap(win.messages, win.gapBeforeId);
        const edge = direction === 'older' ? win.messages[0] : span[span.length - 1] ?? win.messages[win.messages.length - 1];
        const result = await listChannelMessages(token, channel, {
          limit: CHANNEL_FETCH_SIDE,
          ...(direction === 'older' ? { before: edge.id } : { after: edge.id }),
        });
        if (!result.ok) {
          this.noteChannelError(pageId, result, false);
        } else {
          const known = new Set(win.messages.map((m) => m.id));
          const batch = sortMessagesAsc(result.value.filter((m) => !known.has(m.id)));
          if (direction === 'older') {
            const { toAdd, canLoadOlder } = takeOlderPage(batch);
            const tipId = win.gapBeforeId;
            const tip = tipId ? win.messages.find((msg) => msg.id === tipId) : undefined;
            const rest = tip ? win.messages.filter((msg) => msg.id !== tipId) : win.messages;
            win.messages = sortMessagesAsc([...toAdd, ...rest, ...(tip ? [tip] : [])]);
            win.canLoadOlder = canLoadOlder;
            this.capChannel(win, 'newest');
          } else {
            const { toAdd, canLoadNewer } = takeNewerPage(batch);
            win.messages = sortMessagesAsc([...win.messages, ...toAdd]);
            win.canLoadNewer = canLoadNewer;
            this.capChannel(win, 'oldest');
          }
          await this.prefetchThreads(token, win);
        }
      }
    } finally {
      this.loading.delete(pageId);
    }
    return this.snapshot(pageId);
  }

  async loadMoreThread(
    pageId: string,
    messageId: string,
    direction: 'older' | 'newer' = 'older',
  ): Promise<ReviewPageState> {
    const win = this.windows.get(pageId);
    const token = await this.discordToken();
    if (!win || !token) {
      return this.snapshot(pageId);
    }
    const parent = win.messages.find((m) => m.id === messageId);
    const threadId = parent?.thread?.id;
    if (!parent || !threadId || parseDiscordLock(parent.content)) {
      return this.snapshot(pageId);
    }
    this.loading.add(pageId);
    try {
      let entry = win.threads.get(threadId);
      if (!entry) {
        entry = {
          replies: [],
          messageCount: parent.thread?.messageCount,
          canLoadOlder: false,
          canLoadNewer: false,
        };
        win.threads.set(threadId, entry);
      } else if (entry.messageCount === undefined && parent.thread?.messageCount !== undefined) {
        entry.messageCount = parent.thread.messageCount;
      }
      if (direction === 'newer' && entry.gapBeforeId) {
        await this.fillThreadGap(pageId, token, threadId, entry);
      } else if (direction === 'newer') {
        const edge = entry.replies[entry.replies.length - 1];
        const result = await listThreadMessages(token, threadId, {
          limit: THREAD_PAGE + THREAD_PROBE,
          after: edge?.id,
        });
        if (!result.ok) {
          this.noteChannelError(pageId, result, false);
        } else {
          const known = new Set(entry.replies.map((msg) => msg.id));
          const real = sortMessagesAsc(result.value).filter(
            (msg) => isVisibleReply(msg) && !known.has(msg.id),
          );
          const toAdd = real.slice(0, THREAD_PAGE);
          entry.replies = sortMessagesAsc([...entry.replies, ...toAdd]);
          entry.canLoadNewer = real.length > THREAD_PAGE;
          this.capThread(entry, 'oldest');
          await this.enrichReplies(token, toAdd);
        }
      } else {
        const span = spanBeforeGap(entry.replies, entry.gapBeforeId);
        const before = span[0]?.id ?? entry.gapBeforeId;
        const result = await listThreadMessages(token, threadId, {
          limit: THREAD_PAGE + THREAD_PROBE,
          before,
        });
        if (!result.ok) {
          this.noteChannelError(pageId, result, false);
        } else {
          const page = takeThreadPage(
            sortMessagesAsc(result.value),
            THREAD_PAGE,
            entry.messageCount,
            entry.replies,
          );
          const tipId = entry.gapBeforeId;
          const tip = tipId ? entry.replies.find((msg) => msg.id === tipId) : undefined;
          const rest = tip ? entry.replies.filter((msg) => msg.id !== tipId) : entry.replies;
          entry.replies = sortMessagesAsc([...page.toAdd, ...rest, ...(tip ? [tip] : [])]);
          entry.messageCount = page.messageCount ?? entry.messageCount;
          entry.canLoadOlder = !page.exhausted;
          this.capThread(entry, 'newest');
          await this.enrichReplies(token, page.toAdd);
        }
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
    if (!parent || isMrMessage(parent.content) || parseDiscordLock(parent.content)) {
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
          this.noteChannelError(pageId, result, false);
        } else {
          const page = takeThreadPage(
            sortMessagesAsc(result.value),
            THREAD_INITIAL,
            parent.thread?.messageCount,
            [],
          );
          win.threads.set(threadId, {
            replies: page.toAdd,
            messageCount: page.messageCount,
            canLoadOlder: !page.exhausted,
            canLoadNewer: false,
          });
          await this.enrichReplies(token, page.toAdd);
        }
      }
    } finally {
      this.loading.delete(pageId);
    }
    return this.snapshot(pageId);
  }

  async jumpAroundMessage(pageId: string, messageId: string): Promise<ReviewPageState> {
    const channel = await this.listingChannel(pageId);
    const token = await this.discordToken();
    if (!channel || !token) {
      return this.snapshot(pageId);
    }
    this.loading.add(pageId);
    this.errors.delete(pageId);
    try {
      // 3 before + target + 3 after, plus one probe on each side.
      const result = await listChannelMessages(token, channel, {
        around: messageId,
        limit: JUMP_FETCH,
      });
      if (!result.ok) {
        this.noteChannelError(pageId, result, false);
      } else {
        const sliced = windowAroundMessage(result.value, messageId);
        const win: ReviewWindow = {
          ...sliced,
          threads: new Map<string, ThreadBucket>(),
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
   * Periodic refresh: keep the loaded window, update its texts, and light load buttons.
   * New Discord messages stay behind the button until a click.
   */
  async pollRefresh(pageId: string): Promise<ReviewPageState> {
    if (this.loading.has(pageId)) {
      return this.snapshot(pageId);
    }
    const channel = await this.listingChannel(pageId);
    if (!channel) {
      return this.snapshot(pageId);
    }
    const win = this.windows.get(pageId);
    if (!win) {
      return this.loadInitial(pageId);
    }
    const token = await this.discordToken();
    if (!token) {
      return this.snapshot(pageId);
    }
    this.loading.add(pageId);
    this.errors.delete(pageId);
    try {
      await this.syncChannelWindow(pageId, token, channel, win);
      await this.syncLoadedThreads(token, win);
    } finally {
      this.loading.delete(pageId);
    }
    return this.snapshot(pageId);
  }

  private capChannel(win: ReviewWindow, drop: 'oldest' | 'newest', protect?: Set<string>): void {
    const previous = win.messages;
    const next = trimToCap(previous, CHANNEL_CAP, drop, protect);
    const kept = new Set(next.map((msg) => msg.id));
    this.forgetThreads(
      win,
      previous.filter((msg) => !kept.has(msg.id)),
    );
    win.messages = next;
    if (win.gapBeforeId && !kept.has(win.gapBeforeId)) {
      win.gapBeforeId = undefined;
    }
    if (next.length < previous.length && drop === 'oldest') {
      win.canLoadOlder = true;
    }
    if (next.length < previous.length && drop === 'newest' && !win.gapBeforeId) {
      win.canLoadNewer = true;
    }
  }

  private capThread(bucket: ThreadBucket, drop: 'oldest' | 'newest', protect?: Set<string>): void {
    const previous = bucket.replies;
    const next = trimToCap(previous, THREAD_CAP, drop, protect);
    bucket.replies = next;
    if (bucket.gapBeforeId && !next.some((msg) => msg.id === bucket.gapBeforeId)) {
      bucket.gapBeforeId = undefined;
    }
    if (next.length < previous.length && drop === 'oldest') {
      bucket.canLoadOlder = true;
    }
    if (next.length < previous.length && drop === 'newest' && !bucket.gapBeforeId) {
      bucket.canLoadNewer = true;
    }
  }

  private forgetThreads(win: ReviewWindow, removed: DiscordMessage[]): void {
    for (const msg of removed) {
      const threadId = msg.thread?.id;
      if (threadId) {
        win.threads.delete(threadId);
      }
    }
  }

  /** At the live end, append and trim oldest. Otherwise keep one new message past the hole. */
  private placeChannelPost(win: ReviewWindow, message: DiscordMessage): void {
    const idx = win.messages.findIndex((item) => item.id === message.id);
    if (idx >= 0) {
      const prev = win.messages[idx];
      win.messages[idx] = {
        ...message,
        thread: message.thread ?? prev.thread,
        hasThread: message.hasThread || prev.hasThread,
      };
      win.focusMessageId = message.id;
      return;
    }
    if (!win.canLoadNewer && !win.gapBeforeId) {
      win.messages = sortMessagesAsc([...win.messages, message]);
      win.canLoadNewer = false;
      this.capChannel(win, 'oldest', new Set([message.id]));
      win.focusMessageId = message.id;
      return;
    }
    if (win.gapBeforeId) {
      const oldTip = win.messages.find((item) => item.id === win.gapBeforeId);
      win.messages = win.messages.filter((item) => item.id !== win.gapBeforeId);
      if (oldTip) {
        this.forgetThreads(win, [oldTip]);
      }
    }
    win.messages = [...win.messages, message];
    win.gapBeforeId = message.id;
    win.canLoadNewer = true;
    win.focusMessageId = message.id;
  }

  /** At the live end of a thread, append and trim oldest. Otherwise the post is the detached tip. */
  private placeThreadPost(
    win: ReviewWindow,
    threadId: string,
    posted: DiscordMessage,
    messageCount: number | undefined,
  ): void {
    let entry = win.threads.get(threadId);
    const atLiveEnd = !entry || (!entry.canLoadNewer && !entry.gapBeforeId);
    if (!entry) {
      entry = {
        replies: [],
        messageCount,
        canLoadOlder: typeof messageCount === 'number' && messageCount > 1,
        canLoadNewer: false,
      };
      win.threads.set(threadId, entry);
    } else if (messageCount !== undefined) {
      entry.messageCount = messageCount;
    }
    const idx = entry.replies.findIndex((item) => item.id === posted.id);
    if (idx >= 0) {
      entry.replies[idx] = posted;
      return;
    }
    if (atLiveEnd) {
      entry.replies = sortMessagesAsc([...entry.replies, posted]);
      entry.gapBeforeId = undefined;
      entry.canLoadNewer = false;
      this.capThread(entry, 'oldest', new Set([posted.id]));
      return;
    }
    if (entry.gapBeforeId) {
      entry.replies = entry.replies.filter((item) => item.id !== entry.gapBeforeId);
    }
    entry.replies = [...entry.replies, posted];
    entry.gapBeforeId = posted.id;
    entry.canLoadNewer = true;
  }

  private async fillChannelGap(
    pageId: string,
    token: string,
    channel: string,
    win: ReviewWindow,
  ): Promise<void> {
    const tipId = win.gapBeforeId;
    if (!tipId) {
      return;
    }
    const span = spanBeforeGap(win.messages, tipId);
    const edge = span[span.length - 1];
    const result = await listChannelMessages(token, channel, {
      limit: CHANNEL_FETCH_SIDE,
      ...(edge ? { after: edge.id } : { before: tipId }),
    });
    if (!result.ok) {
      this.noteChannelError(pageId, result, false);
      return;
    }
    const known = new Set(win.messages.map((msg) => msg.id));
    const fresh = result.value.filter(isVisibleChannel);
    const visible = fresh.filter((msg) => !known.has(msg.id));
    const beforeTip = visible.filter((msg) => snowflakeLess(msg.id, tipId));
    const toAdd = beforeTip.slice(0, CHANNEL_VISIBLE);
    const moreBefore = beforeTip.length > CHANNEL_VISIBLE;
    const sawTipOrPast = fresh.some((msg) => !snowflakeLess(msg.id, tipId));
    const short = result.value.length < CHANNEL_FETCH_SIDE;
    const tip = win.messages.find((msg) => msg.id === tipId);
    const withoutTip = win.messages.filter((msg) => msg.id !== tipId);
    win.messages = sortMessagesAsc([...withoutTip, ...toAdd]);
    if (!moreBefore && (sawTipOrPast || short)) {
      if (tip) {
        win.messages = sortMessagesAsc([...win.messages, tip]);
      }
      win.gapBeforeId = undefined;
      win.canLoadNewer = fresh.some((msg) => snowflakeLess(tipId, msg.id));
      this.capChannel(win, 'oldest');
    } else {
      if (tip) {
        win.messages = [...win.messages, tip];
      }
      win.gapBeforeId = tip ? tipId : undefined;
      win.canLoadNewer = !!tip;
      this.capChannel(win, 'oldest', tip ? new Set([tipId]) : undefined);
    }
    await this.prefetchThreads(token, win);
  }

  private async fillThreadGap(
    pageId: string,
    token: string,
    threadId: string,
    entry: ThreadBucket,
  ): Promise<void> {
    const tipId = entry.gapBeforeId;
    if (!tipId) {
      return;
    }
    const span = spanBeforeGap(entry.replies, tipId);
    const edge = span[span.length - 1];
    const result = await listThreadMessages(token, threadId, {
      limit: THREAD_PAGE + THREAD_PROBE,
      ...(edge ? { after: edge.id } : { before: tipId }),
    });
    if (!result.ok) {
      this.noteChannelError(pageId, result, false);
      return;
    }
    const known = new Set(entry.replies.map((msg) => msg.id));
    const fresh = sortMessagesAsc(result.value).filter(isVisibleReply);
    const visible = fresh.filter((msg) => !known.has(msg.id));
    const beforeTip = visible.filter((msg) => snowflakeLess(msg.id, tipId));
    const toAdd = beforeTip.slice(0, THREAD_PAGE);
    const moreBefore = beforeTip.length > THREAD_PAGE;
    const sawTipOrPast = fresh.some((msg) => !snowflakeLess(msg.id, tipId));
    const short = result.value.length < THREAD_PAGE + THREAD_PROBE;
    const tip = entry.replies.find((msg) => msg.id === tipId);
    const withoutTip = entry.replies.filter((msg) => msg.id !== tipId);
    entry.replies = sortMessagesAsc([...withoutTip, ...toAdd]);
    if (!moreBefore && (sawTipOrPast || short)) {
      if (tip) {
        entry.replies = sortMessagesAsc([...entry.replies, tip]);
      }
      entry.gapBeforeId = undefined;
      entry.canLoadNewer = fresh.some((msg) => snowflakeLess(tipId, msg.id));
      this.capThread(entry, 'oldest');
    } else {
      if (tip) {
        entry.replies = [...entry.replies, tip];
      }
      entry.gapBeforeId = tip ? tipId : undefined;
      entry.canLoadNewer = !!tip;
      this.capThread(entry, 'oldest', tip ? new Set([tipId]) : undefined);
    }
    await this.enrichReplies(token, toAdd);
  }

  private async probeVisible(
    token: string,
    channelId: string,
    edge: { before?: string; after?: string },
    visible: (msg: DiscordMessage) => boolean,
  ): Promise<boolean | undefined> {
    const result = await listChannelMessages(token, channelId, { ...edge, limit: 5 });
    if (!result.ok) {
      return undefined;
    }
    return result.value.some(visible);
  }

  /** A failed tick must not replace a window that is already on screen. */
  private keepLoadedOnSyncError(pageId: string, result: DiscordError): boolean {
    if (!this.hasLoadedContent(pageId)) {
      this.noteChannelError(pageId, result, false);
      return false;
    }
    return true;
  }

  private async syncChannelWindow(
    pageId: string,
    token: string,
    channelId: string,
    win: ReviewWindow,
  ): Promise<void> {
    const span = spanBeforeGap(win.messages, win.gapBeforeId);
    const tip = win.gapBeforeId
      ? win.messages.find((msg) => msg.id === win.gapBeforeId)
      : undefined;
    if (span.length > 0) {
      const limit = Math.min(100, span.length + SYNC_SLACK);
      const fetched = await listChannelMessages(token, channelId, {
        after: snowflakeBefore(span[0].id),
        limit,
      });
      if (!fetched.ok) {
        this.keepLoadedOnSyncError(pageId, fetched);
        return;
      }
      const synced = applyShownSync(span, fetched.value, isVisibleChannel, fetched.value.length < limit);
      const removed = span.filter((msg) => !synced.some((item) => item.id === msg.id));
      this.forgetThreads(win, removed);
      win.messages = tip ? [...synced, tip] : synced;
      if (win.gapBeforeId && !win.messages.some((msg) => msg.id === win.gapBeforeId)) {
        win.gapBeforeId = undefined;
      }
    }
    if (win.gapBeforeId) {
      const fresh = await getChannelMessage(token, channelId, win.gapBeforeId);
      if (!fresh.ok) {
        if (fresh.status === 404) {
          const removed = win.messages.filter((msg) => msg.id === win.gapBeforeId);
          win.messages = win.messages.filter((msg) => msg.id !== win.gapBeforeId);
          win.gapBeforeId = undefined;
          this.forgetThreads(win, removed);
        }
      } else {
        const idx = win.messages.findIndex((msg) => msg.id === fresh.value.id);
        if (idx >= 0) {
          const prev = win.messages[idx];
          win.messages[idx] = {
            ...fresh.value,
            thread: fresh.value.thread ?? prev.thread,
            hasThread: fresh.value.hasThread || prev.hasThread,
          };
        }
      }
    }
    await this.probeChannelEdges(token, channelId, win);
    this.retainLiveThreads(win);
  }

  private async probeChannelEdges(token: string, channelId: string, win: ReviewWindow): Promise<void> {
    const span = spanBeforeGap(win.messages, win.gapBeforeId);
    const tip = win.gapBeforeId
      ? win.messages.find((msg) => msg.id === win.gapBeforeId)
      : undefined;
    const oldest = span[0] ?? tip;
    if (oldest) {
      const older = await this.probeVisible(token, channelId, { before: oldest.id }, isVisibleChannel);
      if (older !== undefined) {
        win.canLoadOlder = older;
      }
    }
    if (tip && span.length > 0) {
      const between = await listChannelMessages(token, channelId, {
        after: span[span.length - 1].id,
        limit: 5,
      });
      if (!between.ok) {
        return;
      }
      const real = between.value.filter(isVisibleChannel);
      const hole = real.filter((msg) => snowflakeLess(msg.id, tip.id));
      if (hole.length === 0) {
        win.gapBeforeId = undefined;
        win.messages = sortMessagesAsc(win.messages);
        win.canLoadNewer = real.some((msg) => snowflakeLess(tip.id, msg.id));
      } else {
        win.canLoadNewer = true;
      }
      return;
    }
    const newest = span[span.length - 1];
    if (!newest) {
      return;
    }
    const newer = await this.probeVisible(token, channelId, { after: newest.id }, isVisibleChannel);
    if (newer !== undefined) {
      win.canLoadNewer = newer;
    }
  }

  private async syncLoadedThreads(token: string, win: ReviewWindow): Promise<void> {
    let first = true;
    for (const parent of win.messages) {
      const threadId = parent.thread?.id;
      if (!threadId) {
        continue;
      }
      const bucket = win.threads.get(threadId);
      if (!bucket || (bucket.replies.length === 0 && !bucket.gapBeforeId)) {
        continue;
      }
      if (!first) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      first = false;
      await this.syncThreadBucket(token, threadId, bucket);
    }
  }

  private async syncThreadBucket(token: string, threadId: string, bucket: ThreadBucket): Promise<void> {
    const span = spanBeforeGap(bucket.replies, bucket.gapBeforeId);
    const tip = bucket.gapBeforeId
      ? bucket.replies.find((msg) => msg.id === bucket.gapBeforeId)
      : undefined;
    if (span.length > 0) {
      const limit = Math.min(100, span.length + SYNC_SLACK);
      const fetched = await listThreadMessages(token, threadId, {
        after: snowflakeBefore(span[0].id),
        limit,
      });
      if (fetched.ok) {
        const previous = span;
        const synced = applyShownSync(span, fetched.value, isVisibleReply, fetched.value.length < limit);
        this.refreshReplyMeta(previous, synced);
        bucket.replies = tip ? [...synced, tip] : synced;
        if (bucket.gapBeforeId && !bucket.replies.some((msg) => msg.id === bucket.gapBeforeId)) {
          bucket.gapBeforeId = undefined;
        }
        await this.enrichReplies(token, synced);
      }
    }
    if (bucket.gapBeforeId) {
      const fresh = await getChannelMessage(token, threadId, bucket.gapBeforeId);
      if (!fresh.ok) {
        if (fresh.status === 404) {
          bucket.replies = bucket.replies.filter((msg) => msg.id !== bucket.gapBeforeId);
          bucket.gapBeforeId = undefined;
        }
      } else {
        const idx = bucket.replies.findIndex((msg) => msg.id === fresh.value.id);
        if (idx >= 0) {
          if (bucket.replies[idx].content !== fresh.value.content) {
            this.replyMeta.delete(fresh.value.id);
          }
          bucket.replies[idx] = fresh.value;
          await this.enrichReplies(token, [fresh.value]);
        }
      }
    }
    const oldest = spanBeforeGap(bucket.replies, bucket.gapBeforeId)[0];
    const tipNow = bucket.gapBeforeId
      ? bucket.replies.find((msg) => msg.id === bucket.gapBeforeId)
      : undefined;
    const probeOldest = oldest ?? tipNow;
    if (probeOldest) {
      const older = await this.probeVisible(token, threadId, { before: probeOldest.id }, isVisibleReply);
      if (older !== undefined) {
        bucket.canLoadOlder = older;
      }
    }
    const syncedSpan = spanBeforeGap(bucket.replies, bucket.gapBeforeId);
    if (tipNow && syncedSpan.length > 0) {
      const between = await listThreadMessages(token, threadId, {
        after: syncedSpan[syncedSpan.length - 1].id,
        limit: 5,
      });
      if (!between.ok) {
        return;
      }
      const real = between.value.filter(isVisibleReply);
      const hole = real.filter((msg) => snowflakeLess(msg.id, tipNow.id));
      if (hole.length === 0) {
        bucket.gapBeforeId = undefined;
        bucket.replies = sortMessagesAsc(bucket.replies);
        bucket.canLoadNewer = real.some((msg) => snowflakeLess(tipNow.id, msg.id));
      } else {
        bucket.canLoadNewer = true;
      }
      return;
    }
    const newest = syncedSpan[syncedSpan.length - 1];
    if (!newest) {
      return;
    }
    const newer = await this.probeVisible(token, threadId, { after: newest.id }, isVisibleReply);
    if (newer !== undefined) {
      bucket.canLoadNewer = newer;
    }
  }

  private refreshReplyMeta(previous: DiscordMessage[], next: DiscordMessage[]): void {
    const prevById = new Map(previous.map((msg) => [msg.id, msg]));
    for (const msg of next) {
      const prev = prevById.get(msg.id);
      if (!prev || prev.content !== msg.content) {
        this.replyMeta.delete(msg.id);
      }
    }
  }

  private retainLiveThreads(win: ReviewWindow): void {
    const live = new Set(
      win.messages.map((msg) => msg.thread?.id).filter((id): id is string => !!id),
    );
    for (const id of [...win.threads.keys()]) {
      if (!live.has(id)) {
        win.threads.delete(id);
      }
    }
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
    const tokenKey = this.profileContext().repositoryTokenKey;
    const byKey = (await readRepositoryToken(this.secrets, tokenKey)) || '';
    const githubToken =
      byKey || (await readProfileHostToken(this.secrets, profileId, 'github')) || '';
    const gitlabToken =
      byKey || (await readProfileHostToken(this.secrets, profileId, 'gitlab')) || '';
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
    const tokenKey = this.profileContext().repositoryTokenKey;
    await storeSecrets(this.secrets, {
      profileId,
      gitlab: opts.gitlabToken,
      github: opts.githubToken,
      discord: opts.discordToken,
    });
    const tokens = await ensureSecrets(this.secrets, opts.provider, profileId, tokenKey);
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
   * Put a message Discord just accepted into the open channel window.
   * At the live end it is appended. Behind the end it stays as one new message
   * with a hole in front of it. Re-reads it from Discord so the list matches the stored text.
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
    if (!win) {
      await this.loadInitial(pageId);
      win = this.windows.get(pageId);
    }
    if (!win) {
      return;
    }
    this.placeChannelPost(win, message);
  }

  /**
   * «Создать» on a review page. An open MR/PR on the current branch blocks a second one.
   * Posting an existing host MR/PR is {@link pullExistingMr}.
   */
  async handleCreateMr(pageId: string): Promise<
    | {
        kind: 'needPanel';
        branches: string[];
        parent: string;
        people: Array<{ nick: string; name?: string }>;
        defaultAssignee: string;
        provider: ReviewHostProvider;
      }
    | { kind: 'notice'; code: 'alreadyOpen'; provider: ReviewHostProvider }
    | { kind: 'error'; message: string }
  > {
    const looked = await this.lookupOpenMr(pageId);
    if (looked.kind === 'error') {
      return looked;
    }
    if (looked.mr) {
      return { kind: 'notice', code: 'alreadyOpen', provider: looked.access.provider };
    }
    const parent = (await detectParentBranch(this.cwd())) || 'development';
    const branches = await collectMrTargetBranches(this.cwd(), looked.branch, parent);
    const nick = this.hostNick(looked.access.provider);
    return {
      kind: 'needPanel',
      branches,
      parent,
      people: nick ? [{ nick }] : [],
      defaultAssignee: nick,
      provider: looked.access.provider,
    };
  }

  /**
   * «Подтянуть» on a review page: post the open MR/PR of the given branch
   * (or the current checkout when omitted), or report that the channel already has it.
   */
  async pullExistingMr(
    pageId: string,
    sourceBranch?: string,
  ): Promise<
    | { kind: 'state'; state: ReviewPageState; notice: 'added'; provider: ReviewHostProvider }
    | { kind: 'notice'; code: 'noOpen' | 'alreadyInChannel'; provider: ReviewHostProvider }
    | { kind: 'discordFail'; mr: ReviewMr; message: string }
    | { kind: 'error'; message: string }
  > {
    const looked = await this.lookupOpenMr(pageId, sourceBranch);
    if (looked.kind === 'error') {
      return looked;
    }
    if (!looked.mr) {
      return { kind: 'notice', code: 'noOpen', provider: looked.access.provider };
    }
    const token = await this.discordToken();
    if (!token) {
      return { kind: 'error', message: 'Discord bot token is missing' };
    }
    const found = await findMrMessage(token, looked.access.channelId, looked.mr.web_url);
    if (!found.ok) {
      return { kind: 'discordFail', mr: looked.mr, message: found.message };
    }
    if (found.value) {
      return { kind: 'notice', code: 'alreadyInChannel', provider: looked.access.provider };
    }
    const posted = await this.postMrToDiscord(looked.access, looked.mr);
    if (!posted.ok) {
      return { kind: 'discordFail', mr: looked.mr, message: posted.message };
    }
    await this.appendPostedMessage(pageId, looked.access.channelId, posted.message);
    return {
      kind: 'state',
      state: this.snapshot(pageId),
      notice: 'added',
      provider: looked.access.provider,
    };
  }

  /** Open MR/PR for a branch on this review page's origin. */
  private async lookupOpenMr(
    pageId: string,
    sourceBranch?: string,
  ): Promise<
    | { kind: 'ready'; access: ReviewPageAccess; branch: string; mr: ReviewMr | undefined }
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
    let branchName = sourceBranch?.trim() || '';
    if (!branchName) {
      const branch = await currentBranch(this.cwd());
      if (!branch.ok) {
        return { kind: 'error', message: branch.message };
      }
      branchName = branch.value;
    }
    const existing = await this.findOpenByBranch(access, host, branchName);
    if (!existing.ok) {
      return { kind: 'error', message: existing.message };
    }
    return { kind: 'ready', access, branch: branchName, mr: existing.value };
  }

  /** One page of open MR/PR rows for the branch picker panel. */
  async listHostOpenRequests(
    pageId: string,
    page = 1,
  ): Promise<
    | {
        kind: 'ok';
        requests: HostOpenRequest[];
        nextPage: number | undefined;
        currentBranch: string;
        provider: ReviewHostProvider;
      }
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
    const listed =
      access.provider === 'github'
        ? await listGithubOpenPrs(access.repoUrl, host, page)
        : await listGitlabOpenMrs(access.repoUrl, host, page);
    if (!listed.ok) {
      return { kind: 'error', message: listed.message };
    }
    const current = await currentBranch(this.cwd());
    return {
      kind: 'ok',
      requests: listed.value.requests,
      nextPage: listed.value.nextPage,
      currentBranch: current.ok ? current.value : '',
      provider: access.provider,
    };
  }

  /** One page of host branches for the branch picker panel. */
  async listHostBranches(
    pageId: string,
    page = 1,
  ): Promise<
    | {
        kind: 'ok';
        branches: string[];
        nextPage: number | undefined;
        currentBranch: string;
        provider: ReviewHostProvider;
      }
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
    const listed =
      access.provider === 'github'
        ? await listGithubBranches(access.repoUrl, host, page)
        : await listGitlabBranches(access.repoUrl, host, page);
    if (!listed.ok) {
      return { kind: 'error', message: listed.message };
    }
    const current = await currentBranch(this.cwd());
    return {
      kind: 'ok',
      branches: listed.value.branches,
      nextPage: listed.value.nextPage,
      currentBranch: current.ok ? current.value : '',
      provider: access.provider,
    };
  }

  /** Nearest parent branch tip on the host, falling back to the default branch. */
  async resolveHostParent(
    pageId: string,
    branch: string,
  ): Promise<{ kind: 'ok'; parent: string } | { kind: 'error'; message: string }> {
    const access = await this.getAccess(pageId);
    if (!access) {
      return { kind: 'error', message: 'Review page access is not configured' };
    }
    const host = await this.hostToken(access.provider);
    if (!host) {
      const label = access.provider === 'github' ? 'GitHub' : 'GitLab';
      return { kind: 'error', message: `${label} token is missing` };
    }
    const found =
      access.provider === 'github'
        ? await findGithubParentBranch(access.repoUrl, host, branch)
        : await findGitlabParentBranch(access.repoUrl, host, branch);
    if (!found.ok) {
      return { kind: 'error', message: found.message };
    }
    return { kind: 'ok', parent: found.value };
  }

  private async compareHostBranches(
    access: ReviewPageAccess,
    token: string,
    base: string,
    head: string,
  ): Promise<{ ok: true; value: HostCompare } | { ok: false; message: string }> {
    return access.provider === 'github'
      ? compareGithubBranches(access.repoUrl, token, base, head)
      : compareGitlabBranches(access.repoUrl, token, base, head);
  }

  private formatHostDiff(compare: HostCompare): string {
    const parts = [
      `Compare: ${compare.base}...${compare.head}`,
      compare.commitLog ? `Commits:\n${compare.commitLog}` : 'Commits: (none)',
      compare.diffText ? `Diff:\n${compare.diffText}` : 'Diff: (empty)',
    ];
    return parts.join('\n\n');
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
   * Root reviews and explain chips accept color-only patches.
   */
  async updateMrChip(
    pageId: string,
    messageId: string,
    patch: { title?: string; draft?: boolean; color?: string },
  ): Promise<{ kind: 'state'; state: ReviewPageState } | { kind: 'error'; message: string }> {
    const win = this.windows.get(pageId);
    const access = await this.getAccess(pageId);
    const discord = await this.discordToken();
    if (!win || !discord) {
      return { kind: 'error', message: 'MR message not found on the map' };
    }
    // Explain reply in a thread: color-only.
    if (patch.color !== undefined && patch.title === undefined && patch.draft === undefined) {
      const located = this.findReviewMessage(win, messageId);
      if (located?.kind === 'thread' && isExplainMessage(located.found.content)) {
        return this.recolorExplainMessage(pageId, win, located.channelId, discord, located.found, patch.color);
      }
    }
    const parent = win.messages.find((item) => item.id === messageId);
    if (!access || !parent) {
      return { kind: 'error', message: 'MR message not found on the map' };
    }
    const isRootReview = isReviewMessage(parent.content);
    const isExplainRoot = isExplainMessage(parent.content);
    if (!isMrMessage(parent.content) && !isRootReview && !isExplainRoot) {
      return { kind: 'error', message: 'Select an MR_SYN3, R_SYN3 or W_SYN3 chip' };
    }
    if ((isRootReview || isExplainRoot) && (patch.title !== undefined || patch.draft !== undefined)) {
      return { kind: 'error', message: 'Root review has no rename or draft' };
    }
    if (parseDiscordLock(parent.content)) {
      return { kind: 'error', message: 'Entity is locked' };
    }
    if (isMrMessage(parent.content) && parseMrChip(parent.content).status === 'closed') {
      return { kind: 'error', message: 'MR is closed' };
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

  /** Rewrite `color:` on the Discord MR or root-review message, then refresh the chip. */
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
    const current =
      parseMrChip(parent.content).color || parseReviewColor(parent.content) || '';
    if (current.toLowerCase() === color) {
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
        attachments: edited.value.attachments?.length
          ? edited.value.attachments
          : parent.attachments,
      };
    }
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  /** Rewrite `color:` on a W_SYN3 thread reply. */
  private async recolorExplainMessage(
    pageId: string,
    win: ReviewWindow,
    threadId: string,
    discord: string,
    message: DiscordMessage,
    rawColor: string,
  ): Promise<{ kind: 'state'; state: ReviewPageState } | { kind: 'error'; message: string }> {
    const color = normalizeHex(rawColor);
    if (!color) {
      return { kind: 'error', message: 'Color is not a hex value' };
    }
    const current = parseReviewColor(message.content) || EXPLAIN_DEFAULT_COLOR;
    if (current.toLowerCase() === color) {
      return { kind: 'state', state: this.snapshot(pageId) };
    }
    const edited = await editChannelMessage(
      discord,
      threadId,
      message.id,
      replaceMrDiscordColor(message.content, color),
    );
    if (!edited.ok) {
      return { kind: 'error', message: edited.message };
    }
    const bucket = win.threads.get(threadId);
    if (bucket) {
      const idx = bucket.replies.findIndex((item) => item.id === message.id);
      if (idx >= 0) {
        const prev = bucket.replies[idx];
        bucket.replies[idx] = {
          ...edited.value,
          attachments: edited.value.attachments?.length
            ? edited.value.attachments
            : prev.attachments,
        };
      }
    }
    this.replyMeta.set(message.id, {
      isPill: true,
      pillLabel: EXPLAIN_TITLE,
      isExplain: true,
      color,
      branch: parseReviewBranch(edited.value.content) || parseReviewBranch(message.content),
    });
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  /** Write `lock: true|false` on a channel parent. Replies are not lockable. */
  async setParentLock(
    pageId: string,
    messageId: string,
    locked: boolean,
  ): Promise<{ kind: 'state'; state: ReviewPageState } | { kind: 'error'; message: string }> {
    const win = this.windows.get(pageId);
    const access = await this.getAccess(pageId);
    const discord = await this.discordToken();
    const parent = win?.messages.find((item) => item.id === messageId);
    if (!win || !access || !discord || !parent) {
      return { kind: 'error', message: 'Message not found on the map' };
    }
    if (parseDiscordLock(parent.content) === locked) {
      return { kind: 'state', state: this.snapshot(pageId) };
    }
    const edited = await editChannelMessage(
      discord,
      access.channelId,
      parent.id,
      replaceDiscordLock(parent.content, locked),
    );
    if (!edited.ok) {
      return {
        kind: 'error',
        message:
          edited.status === 403
            ? 'The bot can only edit its own messages'
            : edited.message,
      };
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

  /** Close the host MR/PR, then set Discord `status: closed`. */
  async closeMr(
    pageId: string,
    messageId: string,
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
    if (parseDiscordLock(parent.content)) {
      return { kind: 'error', message: 'Entity is locked' };
    }
    const parsed = parseMrChip(parent.content);
    if (parsed.status === 'closed') {
      return { kind: 'state', state: this.snapshot(pageId) };
    }
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
    const closed =
      access.provider === 'github'
        ? await closePullRequest(access.repoUrl, host, iid)
        : await closeMergeRequest(access.repoUrl, host, iid);
    if (!closed.ok) {
      return { kind: 'error', message: closed.message };
    }
    const edited = await editChannelMessage(
      discord,
      access.channelId,
      parent.id,
      replaceMrDiscordStatus(parent.content, 'closed'),
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

  /** Set `status:` on an R_SYN3 thread reply or channel-root review. */
  async setReviewStatus(
    pageId: string,
    messageId: string,
    status: ReviewChipStatus,
  ): Promise<{ kind: 'state'; state: ReviewPageState } | { kind: 'error'; message: string }> {
    const win = this.windows.get(pageId);
    const token = await this.discordToken();
    if (!win || !token) {
      return { kind: 'error', message: 'Review page is not ready' };
    }
    const located = this.findReviewMessage(win, messageId);
    if (!located) {
      return { kind: 'error', message: 'Review message not found on the map' };
    }
    const { found, channelId } = located;
    if (!isReviewMessage(found.content)) {
      return { kind: 'error', message: 'Select an R_SYN3 chip' };
    }
    if (parseDiscordLock(found.content)) {
      return { kind: 'error', message: 'Entity is locked' };
    }
    if (parseReviewStatus(found.content) === status) {
      return { kind: 'state', state: this.snapshot(pageId) };
    }
    const access = located.kind === 'channel' ? await this.getAccess(pageId) : undefined;
    const editChannel =
      located.kind === 'channel' ? access?.channelId : channelId;
    if (!editChannel) {
      return { kind: 'error', message: 'Review page is not ready' };
    }
    const edited = await editChannelMessage(
      token,
      editChannel,
      found.id,
      replaceReviewDiscordStatus(found.content, status),
    );
    if (!edited.ok) {
      return { kind: 'error', message: edited.message };
    }
    if (located.kind === 'channel') {
      const idx = win.messages.findIndex((item) => item.id === found.id);
      if (idx >= 0) {
        const prev = win.messages[idx];
        win.messages[idx] = {
          ...edited.value,
          thread: edited.value.thread ?? prev.thread,
          hasThread: edited.value.hasThread || prev.hasThread,
          attachments: edited.value.attachments?.length ? edited.value.attachments : prev.attachments,
        };
      }
    } else {
      const bucket = win.threads.get(channelId);
      if (bucket) {
        const idx = bucket.replies.findIndex((item) => item.id === found.id);
        if (idx >= 0) {
          const prev = bucket.replies[idx];
          bucket.replies[idx] = {
            ...edited.value,
            attachments: edited.value.attachments?.length ? edited.value.attachments : prev.attachments,
          };
        }
      }
    }
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  /**
   * Locate an R_SYN3 message: channel root or thread reply.
   * `channelId` for a reply is the Discord thread id.
   */
  private findReviewMessage(
    win: ReviewWindow,
    messageId: string,
  ):
    | { kind: 'channel'; found: DiscordMessage; channelId: string }
    | { kind: 'thread'; found: DiscordMessage; channelId: string }
    | undefined {
    const parent = win.messages.find((item) => item.id === messageId);
    if (parent) {
      return { kind: 'channel', found: parent, channelId: '' };
    }
    for (const [threadId, bucket] of win.threads) {
      const found = bucket.replies.find((item) => item.id === messageId);
      if (found) {
        return { kind: 'thread', found, channelId: threadId };
      }
    }
    return undefined;
  }

  /**
   * Delete one Discord message shown on the map: a channel parent or a thread reply.
   * The host MR and any local review file stay.
   */
  async deleteReviewMessage(
    pageId: string,
    messageId: string,
  ): Promise<{ kind: 'state'; state: ReviewPageState } | { kind: 'error'; message: string }> {
    const win = this.windows.get(pageId);
    const token = await this.discordToken();
    if (!win || !token) {
      return { kind: 'error', message: 'Review page is not ready' };
    }
    const parent = win.messages.find((item) => item.id === messageId);
    if (parent) {
      if (parseDiscordLock(parent.content)) {
        return { kind: 'error', message: 'Entity is locked' };
      }
      const access = await this.getAccess(pageId);
      if (!access?.channelId) {
        return { kind: 'error', message: 'Review page is not ready' };
      }
      const removed = await deleteChannelMessage(token, access.channelId, parent.id);
      if (!removed.ok) {
        return { kind: 'error', message: removed.message };
      }
      win.messages = win.messages.filter((item) => item.id !== parent.id);
      const threadId = parent.thread?.id;
      if (threadId) {
        const bucket = win.threads.get(threadId);
        if (bucket) {
          for (const reply of bucket.replies) {
            this.replyMeta.delete(reply.id);
            this.fileCache.delete(reply.id);
          }
        }
        win.threads.delete(threadId);
      }
      this.replyMeta.delete(parent.id);
      this.fileCache.delete(parent.id);
      return { kind: 'state', state: this.snapshot(pageId) };
    }
    let threadId = '';
    let found: DiscordMessage | undefined;
    for (const [id, bucket] of win.threads) {
      found = bucket.replies.find((item) => item.id === messageId);
      if (found) {
        threadId = id;
        break;
      }
    }
    if (!found || !threadId) {
      return { kind: 'error', message: 'Review message not found on the map' };
    }
    const removed = await deleteChannelMessage(token, threadId, found.id);
    if (!removed.ok) {
      return { kind: 'error', message: removed.message };
    }
    const bucket = win.threads.get(threadId);
    if (bucket) {
      bucket.replies = bucket.replies.filter((item) => item.id !== found.id);
      if (typeof bucket.messageCount === 'number') {
        bucket.messageCount = Math.max(0, bucket.messageCount - 1);
      }
    }
    const threadParent = win.messages.find((item) => item.thread?.id === threadId);
    if (threadParent?.thread && typeof threadParent.thread.messageCount === 'number') {
      threadParent.thread = {
        ...threadParent.thread,
        messageCount: Math.max(0, threadParent.thread.messageCount - 1),
      };
    }
    this.replyMeta.delete(found.id);
    this.fileCache.delete(found.id);
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
    const located = this.findReviewMessage(win, messageId);
    const found = located?.found;
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

  /** Write the cached attachment to a temp markdown file and open its preview. */
  async openReviewAttachmentTab(
    pageId: string,
    messageId: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const read = await this.readReviewAttachment(pageId, messageId);
    if (!read.ok) {
      return read;
    }
    const safeName = read.filename.replace(/[^\w.\-]+/g, '_') || 'review.md';
    const safe = /\.md$/i.test(safeName) ? safeName : `${safeName}.md`;
    const dir = path.join(os.tmpdir(), 'syn3-reviews');
    await fs.mkdir(dir, { recursive: true });
    const full = path.join(dir, `${messageId}-${safe}`);
    await fs.writeFile(full, read.text, 'utf8');
    await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(full));
    return { ok: true };
  }

  /**
   * Run the Neurofix agent against the review attachment for the chosen severity scope.
   * Local edits only: no commit, push, Discord status, or Discord message.
   * Optional itemIndex limits the prompt to one bullet inside H/M/S.
   */
  async reviewFixRowsFor(
    pageId: string,
    messageId: string,
  ): Promise<{ ok: true; rows: ReturnType<typeof reviewFixRows> } | { ok: false; message: string }> {
    const read = await this.readReviewAttachment(pageId, messageId);
    if (!read.ok) {
      return read;
    }
    const parsed = parseReviewFixGroups(read.text);
    if (!parsed.ok) {
      return parsed;
    }
    const win = this.windows.get(pageId);
    const located = win ? this.findReviewMessage(win, messageId) : undefined;
    const bullets = located ? parseReviewFixes(located.found.content)?.bullets ?? emptyFixBullets() : emptyFixBullets();
    return { ok: true, rows: reviewFixRows(parsed.groups, bullets) };
  }

  /**
   * Indexes land in `fixes:` and `bullet:` after the worktree changes
   * or the agent prints `SYN3_NEUROFIX_OK`.
   */
  /**
   * True when this review belongs to a branch other than the checkout.
   * Neurofix writes the working copy, so it stays on the checked-out branch.
   * A review with no branch line is not treated as foreign.
   */
  async neurofixNeedsCheckout(pageId: string, messageId: string): Promise<boolean> {
    const win = this.windows.get(pageId);
    if (!win) {
      return false;
    }
    const branch = this.reviewSubjectBranch(win, messageId);
    if (!branch) {
      return false;
    }
    const checkout = await currentBranch(this.cwd());
    if (!checkout.ok) {
      return true;
    }
    return branch.toLocaleLowerCase() !== checkout.value.trim().toLocaleLowerCase();
  }

  /** Branch the review was made for: its own `Branch:` line, or the parent chip's. */
  private reviewSubjectBranch(win: ReviewWindow, messageId: string): string | undefined {
    const located = this.findReviewMessage(win, messageId);
    if (!located) {
      return undefined;
    }
    const own = parseReviewBranch(located.found.content);
    if (own) {
      return own;
    }
    if (located.kind !== 'thread') {
      return undefined;
    }
    const parent = win.messages.find((item) => item.thread?.id === located.channelId);
    return parent ? parseReviewBranch(parent.content) : undefined;
  }

  async runNeuroFix(
    pageId: string,
    messageId: string,
    scope: NeuroFixScope,
    itemIndex?: number,
  ): Promise<{ ok: true; state: ReviewPageState } | { ok: false; message: string; discord?: boolean }> {
    if (await this.neurofixNeedsCheckout(pageId, messageId)) {
      return { ok: false, message: 'neurofixForeignBranch', discord: true };
    }
    const paths = this.profilePaths();
    const fail = async (message: string) => {
      await runNeuroFixSkill({ cwd: this.cwd(), model: paths.fixModel, prompt: '', failMessage: message });
      return { ok: false as const, message };
    };
    const read = await this.readReviewAttachment(pageId, messageId);
    if (!read.ok) {
      return fail(read.message);
    }
    const parsed = parseReviewFixGroups(read.text);
    if (!parsed.ok) {
      return fail(parsed.message);
    }
    const win = this.windows.get(pageId);
    const located = win ? this.findReviewMessage(win, messageId) : undefined;
    const fixed = located ? parseReviewFixes(located.found.content)?.bullets ?? emptyFixBullets() : emptyFixBullets();
    const picked = emptyFixBullets();
    const sections: string[] = [];
    const take = (level: 'H' | 'M' | 'L', indexes: number[]) => {
      const lines: string[] = [];
      for (const index of indexes) {
        const item = parsed.groups[level][index];
        const number = index + 1;
        if (!item || fixed[level].includes(number)) {
          continue;
        }
        picked[level].push(number);
        lines.push(`- ${item}`);
      }
      if (lines.length) {
        sections.push([level, ...lines].join('\n'));
      }
    };
    if (typeof itemIndex === 'number') {
      if (scope === 'all') {
        return fail('Нет замечаний для выбранного scope');
      }
      take(scope, [itemIndex]);
    } else {
      const letters: Array<'H' | 'M' | 'L'> = scope === 'all' ? ['H', 'M', 'L'] : [scope];
      for (const letter of letters) {
        take(letter, parsed.groups[letter].map((_, index) => index));
      }
    }
    if (!sections.length) {
      return fail('Нет замечаний для выбранного scope');
    }
    const levelName = (level: 'H' | 'M' | 'L') =>
      level === 'H' ? 'High' : level === 'M' ? 'Medium' : 'Low';
    const scopeLabel =
      typeof itemIndex === 'number' && scope !== 'all'
        ? `${levelName(scope)} #${itemIndex + 1}`
        : scope === 'all'
          ? 'H, M и L'
          : levelName(scope);
    const prompt = [
      'Исправь замечания код-ревью в рабочей копии.',
      `Scope: ${scopeLabel}.`,
      'Прави только файлы, нужные для этих пунктов.',
      'Не делай коммит, пуш и не пиши в Discord.',
      'Не меняй несвязанный код.',
      `Если пункты исправлены или ты проверил, что они уже исправлены в рабочей копии, последней строкой ответа напиши ровно: ${NEUROFIX_OK_LINE}`,
      'Если правки нет и успех не проверен, эту строку не пиши.',
      '',
      'Замечания:',
      '',
      sections.join('\n\n'),
    ].join('\n');
    const skillRaw = paths.fixSkillPath.trim();
    const skillAbs = skillRaw
      ? path.isAbsolute(skillRaw)
        ? skillRaw
        : path.join(this.cwd(), skillRaw)
      : '';
    const before = await worktreeFingerprint(this.cwd());
    const agent = await runNeuroFixSkill({
      cwd: this.cwd(),
      model: paths.fixModel,
      skillPath: skillAbs,
      prompt,
      printThinking: paths.printThinking,
      printTools: paths.printTools,
    });
    if (!agent.ok) {
      return { ok: false, message: agent.message };
    }
    const after = await worktreeFingerprint(this.cwd());
    const changed = before.ok && after.ok && before.value !== after.value;
    const marked = hasNeuroFixSuccessMarker(agent.answer);
    if (!changed && !marked) {
      const message =
        before.ok && after.ok
          ? 'Рабочая копия не изменилась и агент не подтвердил успех. Пункты не отмечены.'
          : 'Не удалось сверить рабочую копию и агент не подтвердил успех. Пункты не отмечены.';
      agent.report(message, false);
      return { ok: false, message };
    }
    const recorded = await this.recordNeuroFix(pageId, messageId, picked);
    if (!recorded.ok) {
      agent.report(recorded.message, false);
      return { ok: false, message: recorded.message, discord: true };
    }
    agent.report('нейрофикс завершён', true);
    return { ok: true, state: recorded.state };
  }

  /** After a successful neurofix, add the sent 1-based indexes to `fixes:` and `bullet:`. */
  private async recordNeuroFix(
    pageId: string,
    messageId: string,
    picked: ReviewFixState['bullets'],
  ): Promise<{ ok: true; state: ReviewPageState } | { ok: false; message: string }> {
    const win = this.windows.get(pageId);
    const token = await this.discordToken();
    if (!win || !token) {
      return { ok: false, message: 'Review page is not ready' };
    }
    const located = this.findReviewMessage(win, messageId);
    if (!located || !isReviewMessage(located.found.content)) {
      return { ok: false, message: 'Review message not found on the map' };
    }
    const access = located.kind === 'channel' ? await this.getAccess(pageId) : undefined;
    const editChannel = located.kind === 'channel' ? access?.channelId : located.channelId;
    if (!editChannel) {
      return { ok: false, message: 'Review page is not ready' };
    }
    const prev = parseReviewFixes(located.found.content);
    const bullets = emptyFixBullets();
    for (const level of ['H', 'M', 'L'] as const) {
      bullets[level] = [...new Set([...(prev?.bullets[level] ?? []), ...picked[level]])].sort((a, b) => a - b);
    }
    const next: ReviewFixState = {
      counts: { H: bullets.H.length, M: bullets.M.length, L: bullets.L.length },
      at: formatFixStamp(),
      bullets,
    };
    const edited = await editChannelMessage(
      token,
      editChannel,
      located.found.id,
      writeReviewFixes(located.found.content, next),
    );
    if (!edited.ok) {
      return { ok: false, message: edited.message };
    }
    this.rememberEditedReview(win, located, edited.value);
    return { ok: true, state: this.snapshot(pageId) };
  }

  private rememberEditedReview(
    win: ReviewWindow,
    located: { kind: 'channel'; found: DiscordMessage; channelId: string } | { kind: 'thread'; found: DiscordMessage; channelId: string },
    edited: DiscordMessage,
  ): void {
    if (located.kind === 'channel') {
      const idx = win.messages.findIndex((item) => item.id === located.found.id);
      if (idx >= 0) {
        const prev = win.messages[idx];
        win.messages[idx] = {
          ...edited,
          thread: edited.thread ?? prev.thread,
          hasThread: edited.hasThread || prev.hasThread,
          attachments: edited.attachments?.length ? edited.attachments : prev.attachments,
        };
      }
      return;
    }
    const bucket = win.threads.get(located.channelId);
    if (!bucket) {
      return;
    }
    const idx = bucket.replies.findIndex((item) => item.id === located.found.id);
    if (idx >= 0) {
      const prev = bucket.replies[idx];
      bucket.replies[idx] = {
        ...edited,
        attachments: edited.attachments?.length ? edited.attachments : prev.attachments,
      };
    }
  }

  async startOrSendReview(
    pageId: string,
    messageId: string,
    kind: ReviewKind,
    depth?: ReviewDepth,
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
    if (!parent) {
      return { kind: 'error', message: 'Select an MR_SYN3 or R_SYN3 chip' };
    }
    const isMr = isMrMessage(parent.content);
    const isRoot = isReviewMessage(parent.content);
    if (!isMr && !isRoot) {
      return { kind: 'error', message: 'Select an MR_SYN3 or R_SYN3 chip' };
    }
    if (isMr && parseMrChip(parent.content).status === 'closed') {
      return { kind: 'error', message: 'MR is closed' };
    }

    if (isRoot) {
      const chipBranch = parseReviewBranch(parent.content);
      if (!chipBranch) {
        return { kind: 'error', message: 'Root review has no branch' };
      }
      const checkout = await currentBranch(this.cwd());
      const same =
        checkout.ok &&
        chipBranch.toLocaleLowerCase() === checkout.value.trim().toLocaleLowerCase();
      return this.startHostBranchReview(pageId, {
        branch: chipBranch,
        kind: same ? kind : 'branch',
        depth: parseReviewDepth(depth),
        parentMessage: parent,
      });
    }

    const mrBranch = parseReviewBranch(parent.content)?.trim() || '';
    if (mrBranch) {
      const checkout = await currentBranch(this.cwd());
      const same =
        checkout.ok &&
        mrBranch.toLocaleLowerCase() === checkout.value.trim().toLocaleLowerCase();
      // Working copy is another branch: review the MR branch on the host.
      // Local unpushed changes belong to the checkout, not to this MR.
      if (!same) {
        return this.startHostBranchReview(pageId, {
          branch: mrBranch,
          kind: 'branch',
          depth: parseReviewDepth(depth),
          parentMessage: parent,
        });
      }
    }

    const parsed = parseMrChip(parent.content);
    const pendingKey = parsed.webUrl;
    if (!pendingKey) {
      return { kind: 'error', message: 'MR chip has no web_url' };
    }

    const existing = await this.pending.read();
    if (existing && existing.webUrl === pendingKey) {
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
      depth: parseReviewDepth(depth),
      reviewNumber,
      title,
      webUrl: parsed.webUrl,
      printThinking: paths.printThinking,
      printTools: paths.printTools,
    });
    if (!agent.ok) {
      return { kind: 'error', message: agent.message };
    }

    const mrLine = (() => {
      const m = (parsed.webUrl || '').match(/\/(?:merge_requests|pull)\/(\d+)/);
      const mrIid = m ? m[1] : '';
      return [mrIid, title, parsed.webUrl].filter(Boolean).join(' ');
    })();
    try {
      const filePath = await writeReviewFile({
        dirPath: dirAbs,
        reviewNumber,
        mrLine,
        severity: agent.severity,
        kind,
        depth: parseReviewDepth(depth),
        body: agent.body,
      });
      await this.pending.write(pendingKey, kind, filePath);
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

  /**
   * Review another host branch without switching the checkout.
   * Uses host compare against the chosen base. Posts into the open MR/PR thread
   * when one exists (creating the Discord chip first if needed), otherwise a root chip.
   */
  async startOtherBranchReview(
    pageId: string,
    opts: {
      branch: string;
      baseBranch: string;
      depth?: ReviewDepth;
    },
  ): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'fileFail'; message: string }
    | { kind: 'error'; message: string }
  > {
    return this.startHostBranchReview(pageId, {
      branch: opts.branch,
      baseBranch: opts.baseBranch,
      kind: 'branch',
      depth: parseReviewDepth(opts.depth),
    });
  }

  private async startHostBranchReview(
    pageId: string,
    opts: {
      branch: string;
      baseBranch?: string;
      kind: ReviewKind;
      depth: ReviewDepth;
      parentMessage?: DiscordMessage;
    },
  ): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'fileFail'; message: string }
    | { kind: 'error'; message: string }
  > {
    const branchName = opts.branch.trim();
    if (!branchName) {
      return { kind: 'error', message: 'Branch name is empty' };
    }
    const access = await this.getAccess(pageId);
    const host = access ? await this.hostToken(access.provider) : undefined;
    if (!access || !host) {
      return {
        kind: 'error',
        message: `Missing access or ${access?.provider === 'github' ? 'GitHub' : 'GitLab'} token`,
      };
    }
    const token = await this.discordToken();
    if (!token) {
      return { kind: 'error', message: 'Discord bot token is missing' };
    }

    let threadParent = opts.parentMessage;
    let mr: ReviewMr | undefined;

    // Fresh other-branch start: attach to open MR/PR when present.
    if (!threadParent) {
      const open = await this.findOpenByBranch(access, host, branchName);
      if (!open.ok) {
        return { kind: 'error', message: open.message };
      }
      mr = open.value;
      if (mr) {
        const found = await findMrMessage(token, access.channelId, mr.web_url);
        if (!found.ok) {
          return { kind: 'error', message: found.message };
        }
        if (found.value) {
          threadParent = found.value;
          await this.appendPostedMessage(pageId, access.channelId, found.value);
        } else {
          const posted = await this.postMrToDiscord(access, mr);
          if (!posted.ok) {
            return { kind: 'error', message: posted.message };
          }
          await this.appendPostedMessage(pageId, access.channelId, posted.message);
          threadParent = posted.message;
        }
      }
    }

    let baseBranch = opts.baseBranch?.trim() || '';
    if (!baseBranch) {
      const parent = await this.resolveHostParent(pageId, branchName);
      if (parent.kind === 'error') {
        return parent;
      }
      baseBranch = parent.parent;
    }

    const compared = await this.compareHostBranches(access, host, baseBranch, branchName);
    if (!compared.ok) {
      return { kind: 'error', message: compared.message };
    }
    const hostDiff = this.formatHostDiff(compared.value);

    const paths = this.profilePaths();
    if (!paths.skillPath) {
      return { kind: 'error', message: 'Review skill path is not set in the active profile' };
    }
    if (!paths.dirPath) {
      return { kind: 'error', message: 'Review directory path is not set in the active profile' };
    }

    const isMrParent = !!(threadParent && isMrMessage(threadParent.content));
    const isRootParent = !!(threadParent && isReviewMessage(threadParent.content));
    const pendingKey = isMrParent
      ? parseMrChip(threadParent!.content).webUrl || pendingBranchKey(branchName)
      : pendingBranchKey(branchName);

    const existing = await this.pending.read();
    if (existing && existing.webUrl === pendingKey) {
      if (threadParent && (isMrParent || isRootParent)) {
        return this.sendPendingReview(pageId, threadParent, existing.fsPath);
      }
      return this.sendPendingRootReview(pageId, branchName, existing.fsPath);
    }
    if (existing) {
      await deleteReviewFile(existing.fsPath);
      await this.pending.clear();
    }

    let reviewNumber = 1;
    if (threadParent && (isMrParent || isRootParent)) {
      const threadId = threadParent.thread?.id;
      let reviewCount = 0;
      if (threadId) {
        const win = this.windows.get(pageId);
        const entry = win?.threads.get(threadId);
        if (entry) {
          reviewCount = entry.replies.filter((r) => isReviewMessage(r.content)).length;
        } else {
          const listed = await listThreadMessages(token, threadId, { limit: 100 });
          if (listed.ok) {
            reviewCount = listed.value.filter((r) => isReviewMessage(r.content)).length;
          }
        }
      }
      // Root review is #1 on the channel; the first thread reply is #2.
      reviewNumber = isRootParent ? reviewCount + 2 : reviewCount + 1;
    }

    const dirAbs = path.isAbsolute(paths.dirPath)
      ? paths.dirPath
      : path.join(this.cwd(), paths.dirPath);
    const skillAbs = path.isAbsolute(paths.skillPath)
      ? paths.skillPath
      : path.join(this.cwd(), paths.skillPath);
    const title = isMrParent
      ? parseMrChip(threadParent!.content).title || mr?.title || branchName
      : branchName;

    const agent = await runReviewSkill({
      cwd: this.cwd(),
      skillPath: skillAbs,
      model: paths.model,
      kind: opts.kind,
      depth: opts.depth,
      reviewNumber,
      title,
      webUrl: isMrParent ? parseMrChip(threadParent!.content).webUrl : undefined,
      branch: branchName,
      baseBranch,
      hostDiff,
      printThinking: paths.printThinking,
      printTools: paths.printTools,
    });
    if (!agent.ok) {
      return { kind: 'error', message: agent.message };
    }

    const mrLine = isMrParent
      ? (() => {
          const webUrl = parseMrChip(threadParent!.content).webUrl || '';
          const m = webUrl.match(/\/(?:merge_requests|pull)\/(\d+)/);
          const mrIid = m ? m[1] : '';
          return [mrIid, title, webUrl].filter(Boolean).join(' ');
        })()
      : `Branch: ${branchName}`;

    try {
      const filePath = await writeReviewFile({
        dirPath: dirAbs,
        reviewNumber,
        mrLine,
        severity: agent.severity,
        kind: opts.kind,
        depth: opts.depth,
        body: agent.body,
      });
      await this.pending.write(pendingKey, opts.kind, filePath);
      const sent =
        threadParent && (isMrParent || isRootParent)
          ? await this.sendPendingReview(pageId, threadParent, filePath)
          : await this.sendPendingRootReview(pageId, branchName, filePath);
      if (sent.kind === 'state') {
        agent.report(
          threadParent && (isMrParent || isRootParent)
            ? 'Сообщение опубликовано в треде.'
            : 'Сообщение опубликовано в канале.',
          true,
        );
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

  /**
   * Create a channel-root R_SYN3 review (no MR). Posts the file to the channel.
   */
  async startRootReview(
    pageId: string,
    kind: ReviewKind,
    depth?: ReviewDepth,
  ): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'fileFail'; message: string }
    | { kind: 'error'; message: string }
  > {
    if (!pageId) {
      return { kind: 'error', message: 'Review page is not selected' };
    }
    // Channel window is optional here: create MR also posts without a local win.
    // appendPostedMessage loads or rebuilds the window after Discord accepts the file.
    // The map lists from the project review channel when access.json has no page row.
    const channelId = await this.listingChannel(pageId);
    if (!channelId) {
      return { kind: 'error', message: 'Review Discord channel is not set' };
    }
    const token = await this.discordToken();
    if (!token) {
      return { kind: 'error', message: 'Discord bot token is missing' };
    }
    const branch = await currentBranch(this.cwd());
    if (!branch.ok) {
      return { kind: 'error', message: 'Detached HEAD — cannot start review' };
    }
    const branchName = branch.value;
    const pendingKey = pendingBranchKey(branchName);

    const existing = await this.pending.read();
    if (existing && existing.webUrl === pendingKey) {
      return this.sendPendingRootReview(pageId, branchName, existing.fsPath);
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

    const reviewNumber = 1;
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
      depth: parseReviewDepth(depth),
      reviewNumber,
      title: branchName,
      branch: branchName,
      printThinking: paths.printThinking,
      printTools: paths.printTools,
    });
    if (!agent.ok) {
      return { kind: 'error', message: agent.message };
    }

    try {
      const filePath = await writeReviewFile({
        dirPath: dirAbs,
        reviewNumber,
        mrLine: `Branch: ${branchName}`,
        severity: agent.severity,
        kind,
        depth: parseReviewDepth(depth),
        body: agent.body,
      });
      await this.pending.write(pendingKey, kind, filePath);
      const sent = await this.sendPendingRootReview(pageId, branchName, filePath);
      if (sent.kind === 'state') {
        agent.report('Сообщение опубликовано в канале.', true);
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
    if (isPendingBranchKey(pending.webUrl) && !messageId) {
      const branch = pending.webUrl.slice('branch:'.length).trim();
      return this.sendPendingRootReview(pageId, branch, pending.fsPath);
    }
    const parent = win.messages.find((m) => m.id === messageId);
    if (!parent) {
      return { kind: 'error', message: 'Review message not found on the map' };
    }
    return this.sendPendingReview(pageId, parent, pending.fsPath);
  }

  async retryRootReviewFile(pageId: string): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'fileFail'; message: string }
    | { kind: 'error'; message: string }
  > {
    return this.retryReviewFile(pageId, '');
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
    parent.thread = { id: thread.value.id, messageCount: thread.value.messageCount };
    const paths = this.profilePaths();
    let reviewNumber = 1;
    let severity = formatSeverityLine(0, 0, 0);
    let scope: 'branch' | 'changes' | undefined;
    let depthToken: 'rs' | 'rl' | 'rm' | 'rd' | undefined;
    try {
      const fileText = await fs.readFile(filePath, 'utf8');
      const parsedFile = parseReviewAttachment(fileText);
      if (parsedFile.reviewNumber) {
        reviewNumber = parsedFile.reviewNumber;
      }
      if (parsedFile.severity) {
        severity = parsedFile.severity;
      }
      scope = parsedFile.scope;
      depthToken = parsedFile.depth;
    } catch {
      // keep defaults
    }
    const content = formatReviewDiscordBody({
      reviewNumber,
      severity,
      scope,
      depth: depthToken,
      model: paths.model,
      skillPath: paths.skillPath,
    });
    const posted = await postMessageWithFile(token, thread.value.id, content, filePath);
    if (!posted.ok) {
      return { kind: 'fileFail', message: posted.message };
    }
    const postedCount =
      typeof thread.value.messageCount === 'number' ? thread.value.messageCount + 1 : undefined;
    parent.thread = { id: thread.value.id, messageCount: postedCount };
    await this.pending.clear();
    await deleteReviewFile(filePath);
    const win = this.windows.get(pageId);
    if (win) {
      const idx = win.messages.findIndex((m) => m.id === parent.id);
      if (idx >= 0) {
        win.messages[idx] = {
          ...win.messages[idx],
          thread: { id: thread.value.id, messageCount: postedCount },
          hasThread: true,
        };
      }
      this.placeThreadPost(win, thread.value.id, posted.value, postedCount);
      await this.enrichReplies(token, [posted.value]);
    }
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  /** Post a pending root review file as a channel message (no thread). */
  private async sendPendingRootReview(
    pageId: string,
    branch: string,
    filePath: string,
  ): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'fileFail'; message: string }
    | { kind: 'error'; message: string }
  > {
    const channelId = await this.listingChannel(pageId);
    const token = await this.discordToken();
    if (!channelId || !token) {
      return { kind: 'error', message: 'Missing Discord access' };
    }
    const paths = this.profilePaths();
    let reviewNumber = 1;
    let severity = formatSeverityLine(0, 0, 0);
    let scope: 'branch' | 'changes' | undefined;
    let depthToken: 'rs' | 'rl' | 'rm' | 'rd' | undefined;
    try {
      const fileText = await fs.readFile(filePath, 'utf8');
      const parsedFile = parseReviewAttachment(fileText);
      if (parsedFile.reviewNumber) {
        reviewNumber = parsedFile.reviewNumber;
      }
      if (parsedFile.severity) {
        severity = parsedFile.severity;
      }
      scope = parsedFile.scope;
      depthToken = parsedFile.depth;
    } catch {
      // keep defaults
    }
    const content = formatReviewDiscordBody({
      reviewNumber,
      severity,
      scope,
      depth: depthToken,
      model: paths.model,
      skillPath: paths.skillPath,
      branch,
      color: randomLinkPaletteColor(),
    });
    const posted = await postMessageWithFile(token, channelId, content, filePath);
    if (!posted.ok) {
      return { kind: 'fileFail', message: posted.message };
    }
    await this.pending.clear();
    await deleteReviewFile(filePath);
    await this.appendPostedMessage(pageId, channelId, posted.value);
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  /**
   * Start «Что сделано» under an MR or root-review chip.
   * Posts into that parent's thread.
   */
  async startOrSendExplain(
    pageId: string,
    messageId: string,
    kind: ReviewKind,
    depth?: ReviewDepth,
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
    if (!parent) {
      return { kind: 'error', message: 'Select an MR_SYN3 or R_SYN3 chip' };
    }
    const isMr = isMrMessage(parent.content);
    const isRoot = isReviewMessage(parent.content);
    if (!isMr && !isRoot) {
      return { kind: 'error', message: 'Select an MR_SYN3 or R_SYN3 chip' };
    }
    if (isMr && parseMrChip(parent.content).status === 'closed') {
      return { kind: 'error', message: 'MR is closed' };
    }

    if (isRoot) {
      const chipBranch = parseReviewBranch(parent.content);
      if (!chipBranch) {
        return { kind: 'error', message: 'Root review has no branch' };
      }
      const checkout = await currentBranch(this.cwd());
      const same =
        checkout.ok &&
        chipBranch.toLocaleLowerCase() === checkout.value.trim().toLocaleLowerCase();
      return this.startHostBranchExplain(pageId, {
        branch: chipBranch,
        kind: same ? kind : 'branch',
        depth: parseReviewDepth(depth),
        parentMessage: parent,
      });
    }

    const mrBranch = parseReviewBranch(parent.content)?.trim() || '';
    if (mrBranch) {
      const checkout = await currentBranch(this.cwd());
      const same =
        checkout.ok &&
        mrBranch.toLocaleLowerCase() === checkout.value.trim().toLocaleLowerCase();
      if (!same) {
        return this.startHostBranchExplain(pageId, {
          branch: mrBranch,
          kind: 'branch',
          depth: parseReviewDepth(depth),
          parentMessage: parent,
        });
      }
    }

    const parsed = parseMrChip(parent.content);
    const pendingKey = parsed.webUrl;
    if (!pendingKey) {
      return { kind: 'error', message: 'MR chip has no web_url' };
    }

    const existing = await this.explainPending.read();
    if (existing && existing.webUrl === pendingKey) {
      return this.sendPendingExplain(pageId, parent, existing.fsPath, existing.branch);
    }
    if (existing) {
      await deleteReviewFile(existing.fsPath);
      await this.explainPending.clear();
    }

    const paths = this.profilePaths();
    if (!paths.explainSkillPath) {
      return { kind: 'error', message: 'Explain skill path is not set in the active profile' };
    }
    if (!paths.dirPath) {
      return { kind: 'error', message: 'Review directory path is not set in the active profile' };
    }

    const checkout = await currentBranch(this.cwd());
    const branch = mrBranch || (checkout.ok ? checkout.value : '');
    if (!branch) {
      return { kind: 'error', message: 'Detached HEAD — cannot start explain' };
    }

    const dirAbs = path.isAbsolute(paths.dirPath)
      ? paths.dirPath
      : path.join(this.cwd(), paths.dirPath);
    const skillAbs = path.isAbsolute(paths.explainSkillPath)
      ? paths.explainSkillPath
      : path.join(this.cwd(), paths.explainSkillPath);
    const title = parsed.title || 'MR';

    const agent = await runExplainSkill({
      cwd: this.cwd(),
      skillPath: skillAbs,
      model: paths.model,
      kind,
      depth: parseReviewDepth(depth),
      title,
      webUrl: parsed.webUrl,
      branch,
      printThinking: paths.printThinking,
      printTools: paths.printTools,
    });
    if (!agent.ok) {
      return { kind: 'error', message: agent.message };
    }

    try {
      const filePath = await writeExplainFile({
        dirPath: dirAbs,
        branch,
        body: agent.body,
      });
      await this.explainPending.write(pendingKey, kind, filePath, branch, parseReviewDepth(depth));
      const sent = await this.sendPendingExplain(pageId, parent, filePath, branch);
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

  /** Root «Что сделано» on the current checkout (Create menu). */
  async startRootExplain(
    pageId: string,
    kind: ReviewKind,
    depth?: ReviewDepth,
  ): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'fileFail'; message: string }
    | { kind: 'error'; message: string }
  > {
    if (!pageId) {
      return { kind: 'error', message: 'Review page is not selected' };
    }
    const channelId = await this.listingChannel(pageId);
    if (!channelId) {
      return { kind: 'error', message: 'Review Discord channel is not set' };
    }
    const token = await this.discordToken();
    if (!token) {
      return { kind: 'error', message: 'Discord bot token is missing' };
    }
    const branch = await currentBranch(this.cwd());
    if (!branch.ok) {
      return { kind: 'error', message: 'Detached HEAD — cannot start explain' };
    }
    const branchName = branch.value;
    const pendingKey = pendingBranchKey(branchName);

    const existing = await this.explainPending.read();
    if (existing && existing.webUrl === pendingKey) {
      return this.sendPendingRootExplain(pageId, branchName, existing.fsPath);
    }
    if (existing) {
      await deleteReviewFile(existing.fsPath);
      await this.explainPending.clear();
    }

    const paths = this.profilePaths();
    if (!paths.explainSkillPath) {
      return { kind: 'error', message: 'Explain skill path is not set in the active profile' };
    }
    if (!paths.dirPath) {
      return { kind: 'error', message: 'Review directory path is not set in the active profile' };
    }

    const dirAbs = path.isAbsolute(paths.dirPath)
      ? paths.dirPath
      : path.join(this.cwd(), paths.dirPath);
    const skillAbs = path.isAbsolute(paths.explainSkillPath)
      ? paths.explainSkillPath
      : path.join(this.cwd(), paths.explainSkillPath);

    const agent = await runExplainSkill({
      cwd: this.cwd(),
      skillPath: skillAbs,
      model: paths.model,
      kind,
      depth: parseReviewDepth(depth),
      title: branchName,
      branch: branchName,
      printThinking: paths.printThinking,
      printTools: paths.printTools,
    });
    if (!agent.ok) {
      return { kind: 'error', message: agent.message };
    }

    try {
      const filePath = await writeExplainFile({
        dirPath: dirAbs,
        branch: branchName,
        body: agent.body,
      });
      await this.explainPending.write(pendingKey, kind, filePath, branchName, parseReviewDepth(depth));
      const sent = await this.sendPendingRootExplain(pageId, branchName, filePath);
      if (sent.kind === 'state') {
        agent.report('Сообщение опубликовано в канале.', true);
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

  /** Explain another host branch without switching the checkout. */
  async startOtherBranchExplain(
    pageId: string,
    opts: {
      branch: string;
      baseBranch: string;
      depth?: ReviewDepth;
      parentMessageId?: string;
    },
  ): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'fileFail'; message: string }
    | { kind: 'error'; message: string }
  > {
    const win = this.windows.get(pageId);
    const parent = opts.parentMessageId
      ? win?.messages.find((m) => m.id === opts.parentMessageId)
      : undefined;
    return this.startHostBranchExplain(pageId, {
      branch: opts.branch,
      baseBranch: opts.baseBranch,
      kind: 'branch',
      depth: parseReviewDepth(opts.depth),
      parentMessage: parent,
    });
  }

  private async startHostBranchExplain(
    pageId: string,
    opts: {
      branch: string;
      baseBranch?: string;
      kind: ReviewKind;
      depth: ReviewDepth;
      parentMessage?: DiscordMessage;
    },
  ): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'fileFail'; message: string }
    | { kind: 'error'; message: string }
  > {
    const branchName = opts.branch.trim();
    if (!branchName) {
      return { kind: 'error', message: 'Branch name is empty' };
    }
    const access = await this.getAccess(pageId);
    const host = access ? await this.hostToken(access.provider) : undefined;
    if (!access || !host) {
      return {
        kind: 'error',
        message: `Missing access or ${access?.provider === 'github' ? 'GitHub' : 'GitLab'} token`,
      };
    }
    const token = await this.discordToken();
    if (!token) {
      return { kind: 'error', message: 'Discord bot token is missing' };
    }

    let threadParent = opts.parentMessage;
    let mr: ReviewMr | undefined;

    if (!threadParent) {
      const open = await this.findOpenByBranch(access, host, branchName);
      if (!open.ok) {
        return { kind: 'error', message: open.message };
      }
      mr = open.value;
      if (mr) {
        const found = await findMrMessage(token, access.channelId, mr.web_url);
        if (!found.ok) {
          return { kind: 'error', message: found.message };
        }
        if (found.value) {
          threadParent = found.value;
          await this.appendPostedMessage(pageId, access.channelId, found.value);
        } else {
          const posted = await this.postMrToDiscord(access, mr);
          if (!posted.ok) {
            return { kind: 'error', message: posted.message };
          }
          await this.appendPostedMessage(pageId, access.channelId, posted.message);
          threadParent = posted.message;
        }
      }
    }

    let baseBranch = opts.baseBranch?.trim() || '';
    if (!baseBranch) {
      const parent = await this.resolveHostParent(pageId, branchName);
      if (parent.kind === 'error') {
        return parent;
      }
      baseBranch = parent.parent;
    }

    const compared = await this.compareHostBranches(access, host, baseBranch, branchName);
    if (!compared.ok) {
      return { kind: 'error', message: compared.message };
    }
    const hostDiff = this.formatHostDiff(compared.value);

    const paths = this.profilePaths();
    if (!paths.explainSkillPath) {
      return { kind: 'error', message: 'Explain skill path is not set in the active profile' };
    }
    if (!paths.dirPath) {
      return { kind: 'error', message: 'Review directory path is not set in the active profile' };
    }

    const isMrParent = !!(threadParent && isMrMessage(threadParent.content));
    const isRootParent = !!(threadParent && isReviewMessage(threadParent.content));
    const pendingKey = isMrParent
      ? parseMrChip(threadParent!.content).webUrl || pendingBranchKey(branchName)
      : pendingBranchKey(branchName);

    const existing = await this.explainPending.read();
    if (existing && existing.webUrl === pendingKey) {
      if (threadParent && (isMrParent || isRootParent)) {
        return this.sendPendingExplain(pageId, threadParent, existing.fsPath, existing.branch);
      }
      return this.sendPendingRootExplain(pageId, branchName, existing.fsPath);
    }
    if (existing) {
      await deleteReviewFile(existing.fsPath);
      await this.explainPending.clear();
    }

    const dirAbs = path.isAbsolute(paths.dirPath)
      ? paths.dirPath
      : path.join(this.cwd(), paths.dirPath);
    const skillAbs = path.isAbsolute(paths.explainSkillPath)
      ? paths.explainSkillPath
      : path.join(this.cwd(), paths.explainSkillPath);
    const title = isMrParent
      ? parseMrChip(threadParent!.content).title || mr?.title || branchName
      : branchName;

    const agent = await runExplainSkill({
      cwd: this.cwd(),
      skillPath: skillAbs,
      model: paths.model,
      kind: opts.kind,
      depth: opts.depth,
      title,
      webUrl: isMrParent ? parseMrChip(threadParent!.content).webUrl : undefined,
      branch: branchName,
      baseBranch,
      hostDiff,
      printThinking: paths.printThinking,
      printTools: paths.printTools,
    });
    if (!agent.ok) {
      return { kind: 'error', message: agent.message };
    }

    try {
      const filePath = await writeExplainFile({
        dirPath: dirAbs,
        branch: branchName,
        body: agent.body,
      });
      await this.explainPending.write(pendingKey, opts.kind, filePath, branchName, opts.depth);
      const sent =
        threadParent && (isMrParent || isRootParent)
          ? await this.sendPendingExplain(pageId, threadParent, filePath, branchName)
          : await this.sendPendingRootExplain(pageId, branchName, filePath);
      if (sent.kind === 'state') {
        agent.report(
          threadParent && (isMrParent || isRootParent)
            ? 'Сообщение опубликовано в треде.'
            : 'Сообщение опубликовано в канале.',
          true,
        );
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

  async retryExplainFile(pageId: string, messageId: string): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'fileFail'; message: string }
    | { kind: 'error'; message: string }
  > {
    const win = this.windows.get(pageId);
    const pending = await this.explainPending.read();
    if (!win || !pending) {
      return { kind: 'error', message: 'No pending explain file' };
    }
    if (isPendingBranchKey(pending.webUrl) && !messageId) {
      const branch = pending.webUrl.slice('branch:'.length).trim();
      return this.sendPendingRootExplain(pageId, branch, pending.fsPath);
    }
    const parent = win.messages.find((m) => m.id === messageId);
    if (!parent) {
      return { kind: 'error', message: 'Explain parent not found on the map' };
    }
    return this.sendPendingExplain(pageId, parent, pending.fsPath, pending.branch);
  }

  async retryRootExplainFile(pageId: string): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'fileFail'; message: string }
    | { kind: 'error'; message: string }
  > {
    return this.retryExplainFile(pageId, '');
  }

  private async sendPendingExplain(
    pageId: string,
    parent: DiscordMessage,
    filePath: string,
    branch: string,
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
    parent.thread = { id: thread.value.id, messageCount: thread.value.messageCount };
    const paths = this.profilePaths();
    const pending = await this.explainPending.read();
    const content = formatExplainDiscordBody({
      model: paths.model,
      skillPath: paths.explainSkillPath,
      branch,
      scope: reviewScopeToken(pending?.kind ?? 'changes'),
      depth: reviewDepthToken(pending?.depth ?? 'medium'),
      color: EXPLAIN_DEFAULT_COLOR,
    });
    const posted = await postMessageWithFile(token, thread.value.id, content, filePath);
    if (!posted.ok) {
      return { kind: 'fileFail', message: posted.message };
    }
    const postedCount =
      typeof thread.value.messageCount === 'number' ? thread.value.messageCount + 1 : undefined;
    parent.thread = { id: thread.value.id, messageCount: postedCount };
    await this.explainPending.clear();
    await deleteReviewFile(filePath);
    const win = this.windows.get(pageId);
    if (win) {
      const idx = win.messages.findIndex((m) => m.id === parent.id);
      if (idx >= 0) {
        win.messages[idx] = {
          ...win.messages[idx],
          thread: { id: thread.value.id, messageCount: postedCount },
          hasThread: true,
        };
      }
      this.placeThreadPost(win, thread.value.id, posted.value, postedCount);
      await this.enrichReplies(token, [posted.value]);
    }
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  private async sendPendingRootExplain(
    pageId: string,
    branch: string,
    filePath: string,
  ): Promise<
    | { kind: 'state'; state: ReviewPageState }
    | { kind: 'fileFail'; message: string }
    | { kind: 'error'; message: string }
  > {
    const channelId = await this.listingChannel(pageId);
    const token = await this.discordToken();
    if (!channelId || !token) {
      return { kind: 'error', message: 'Missing Discord access' };
    }
    const paths = this.profilePaths();
    const pending = await this.explainPending.read();
    const content = formatExplainDiscordBody({
      model: paths.model,
      skillPath: paths.explainSkillPath,
      branch,
      scope: reviewScopeToken(pending?.kind ?? 'branch'),
      depth: reviewDepthToken(pending?.depth ?? 'medium'),
      color: EXPLAIN_DEFAULT_COLOR,
    });
    const posted = await postMessageWithFile(token, channelId, content, filePath);
    if (!posted.ok) {
      return { kind: 'fileFail', message: posted.message };
    }
    await this.explainPending.clear();
    await deleteReviewFile(filePath);
    await this.appendPostedMessage(pageId, channelId, posted.value);
    return { kind: 'state', state: this.snapshot(pageId) };
  }
}
