import * as fs from 'fs/promises';
import * as path from 'path';

const API = 'https://discord.com/api/v10';
export const MR_PREFIX = 'MR_SYN3';
/** Draft merge-request message prefix (same chip family as MR_SYN3). */
export const DMR_PREFIX = 'DMR_SYN3';
/** Review message prefix in Discord threads: `R_SYN3: Ревью N | branch | rd | H:…`. */
export const REVIEW_PREFIX = 'R_SYN3';
/** Re-review message prefix: `RR_SYN3: Реревью N на Ревью K | branch | rd | L:1, 2`. */
export const REREVIEW_PREFIX = 'RR_SYN3';
/** Explain («Что сделано») message prefix: `W_SYN3: Что сделано | branch | rl`. */
export const EXPLAIN_PREFIX = 'W_SYN3';
/** Chip and file title for an explain message. Older Discord lines still say `Что делаем?`. */
export const EXPLAIN_TITLE = 'Что сделано';
/** Default chip color for explain messages (Violet). */
export const EXPLAIN_DEFAULT_COLOR = '#8e4ec6';
/** Scenario group root message: `GRSCN_SYN3`. */
export const SCENARIO_GROUP_PREFIX = 'GRSCN_SYN3';
/** Scenario chip message: `SCN_SYN3`. */
export const SCENARIO_PREFIX = 'SCN_SYN3';
/** Default title for a new scenario chip. */
export const SCENARIO_DEFAULT_TITLE = 'сценарий';
/** Default title for a new scenario group. */
export const SCENARIO_GROUP_DEFAULT_TITLE = 'Группа сценариев';
/** Max scenarios inside one GRSCN_SYN3 thread. */
export const SCENARIO_GROUP_MAX = 10;
export {
  PROFILE_CONFIG_PREFIX,
  EXPLORER_CONFIG_PREFIX,
  NOTES_CONFIG_PREFIX,
  LINKS_CONFIG_PREFIX,
  REVIEW_CONFIG_PREFIX,
  isConfigMessage,
  parseConfigHeader,
  formatConfigHeader,
} from './configFormat';
import { formatConfigHeaderDate } from './configFormat';
/**
 * Severity line inside agent stdout.
 * Canonical form is `H:n | M:n | L:n`. Legacy `S` (former simple) maps to `L`.
 * A review file and chip put `branch|changes | rl|rm|rd | ` in front of this line.
 * Older chips may still say `rs` instead of `rl`.
 */
export const REVIEW_SEVERITY_RE =
  /^H:\s*(\d+)\s*\|\s*M:\s*(\d+)\s*\|\s*([LS]):\s*(\d+)\s*$/i;

/** Review severity group. `S` in older files and chips is the same level as `L`. */
export type ReviewLevel = 'H' | 'M' | 'L';

/** Kind token on a review file line and chip. Legacy files may still say `change`. */
export type ReviewScopeToken = 'branch' | 'changes';
/** Depth token on a review file line and chip. New runs write `rl`. Older chips may still say `rs`. */
export type ReviewDepthToken = 'rs' | 'rl' | 'rm' | 'rd';

const REVIEW_SCOPE_PREFIX_RE = /^(branch|changes?)\s*\|\s*(rs|rl|rm|rd)\s*\|\s*/i;

/** `change` from older files and chips is the same scope as `changes`. */
export function normalizeReviewScopeToken(raw: string): ReviewScopeToken | undefined {
  const v = raw.trim().toLowerCase();
  if (v === 'branch') {
    return 'branch';
  }
  if (v === 'change' || v === 'changes') {
    return 'changes';
  }
  return undefined;
}

export type ParsedReviewSeverity = {
  scope?: ReviewScopeToken;
  depth?: ReviewDepthToken;
  /** Canonical `H:n | M:n | L:n`. */
  severity: string;
};

/** `H`, `M`, `L`. Older `S` is Low. */
export function reviewLevel(raw: string): ReviewLevel | undefined {
  const letter = raw.trim().toUpperCase();
  if (letter === 'H' || letter === 'M' || letter === 'L') {
    return letter;
  }
  if (letter === 'S') {
    return 'L';
  }
  return undefined;
}

/** Format a normalized severity line. Legacy S counts become L. */
export function formatSeverityLine(h: string | number, m: string | number, low: string | number): string {
  return `H:${h} | M:${m} | L:${low}`;
}

/** Match a severity line and return the canonical `H:n | M:n | L:n` form. */
export function normalizeSeverityMatch(match: RegExpMatchArray): string {
  return formatSeverityLine(match[1], match[2], match[4]);
}

/** File line 3 and the tail of a chip: `branch | rd | H:n | M:n | L:n`. Legacy S is Low. */
export function formatReviewScopeLine(
  scope: ReviewScopeToken,
  depth: ReviewDepthToken,
  severity: string,
): string {
  return `${scope} | ${depth} | ${severity}`;
}

/**
 * Read a bare severity line or one with a kind and depth prefix.
 * A bare line stays valid for reviews written before the prefix.
 */
export function parseReviewSeverityLine(line: string): ParsedReviewSeverity | undefined {
  const trimmed = line.trim();
  const prefix = REVIEW_SCOPE_PREFIX_RE.exec(trimmed);
  const rest = prefix ? trimmed.slice(prefix[0].length).trim() : trimmed;
  const sev = rest.match(REVIEW_SEVERITY_RE);
  if (!sev) {
    return undefined;
  }
  const severity = normalizeSeverityMatch(sev);
  if (!prefix) {
    return { severity };
  }
  return {
    scope: normalizeReviewScopeToken(prefix[1]),
    depth: prefix[2].toLowerCase() as ReviewDepthToken,
    severity,
  };
}

const MR_HEAD_RE = /^\(?((?:MR_SYN3|DMR_SYN3))\)?:\s*(.*)$/;
const REVIEW_HEAD_RE = /^\(?R_SYN3\)?:\s*(.*)$/;
const REREVIEW_HEAD_RE = /^\(?RR_SYN3\)?:\s*(.*)$/;
/** One selected level: `L:1, 2` or `H:all`. */
const REREVIEW_PART_RE = /^([HML]):\s*(all|\d+(?:\s*,\s*\d+)*)\s*$/i;
const EXPLAIN_HEAD_RE = /^\(?W_SYN3\)?:\s*(.*)$/;
const SCENARIO_GROUP_HEAD_RE = /^\(?GRSCN_SYN3\)?\s*$/i;
const SCENARIO_HEAD_RE = /^\(?SCN_SYN3\)?\s*$/i;
const MD_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/;
/** Discord message flag: do not unfurl links into embed previews. */
const SUPPRESS_EMBEDS = 1 << 2;

function messagePayload(content: string): { content: string; flags: number } {
  return { content, flags: SUPPRESS_EMBEDS };
}

/** Placeholder that points at the parent message. Not counted in `message_count`. */
export const THREAD_STARTER_MESSAGE = 21;

/**
 * Types that carry a person's text. Everything else is a Discord client notice
 * (`THREAD_CREATED` is «начинает ветку», and its content is only the thread name).
 */
const DISCORD_USER_MESSAGE_TYPES = new Set([0, 19, 20, 23]);

export function isDiscordSystemNotice(msg: { type?: number }): boolean {
  return typeof msg.type === 'number' && !DISCORD_USER_MESSAGE_TYPES.has(msg.type);
}

export interface DiscordThreadRef {
  id: string;
  /**
   * Discord `message_count`: messages in the thread, excluding the starter
   * and deleted messages.
   */
  messageCount?: number;
}

export interface DiscordMessage {
  id: string;
  content: string;
  /** Discord username when present (not a substitute for message text). */
  author?: string;
  timestamp: string;
  /** Discord message type. `21` is the thread starter placeholder. */
  type?: number;
  /** Present when the message starts a thread. */
  thread?: DiscordThreadRef;
  attachments?: Array<{ id: string; filename: string; url: string }>;
  /** True when this message has a thread (from has_thread or thread object). */
  hasThread?: boolean;
  /** True when API returned no usable text (often missing Message Content Intent). */
  contentMissing?: boolean;
}

export interface DiscordError {
  ok: false;
  status: number;
  message: string;
}

export type DiscordResult<T> = { ok: true; value: T } | DiscordError;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type DiscordFetchAttempt = DiscordResult<unknown> & { retryAfterMs?: number };

async function discordFetchOnce(
  token: string,
  method: string,
  route: string,
  body?: string | FormData | Uint8Array,
  contentType?: string,
): Promise<DiscordFetchAttempt> {
  const headers: Record<string, string> = {
    Authorization: `Bot ${token}`,
  };
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${API}${route}`, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    let json: unknown = undefined;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
    }
    if (!response.ok) {
      const raw =
        json && typeof json === 'object' && 'message' in json
          ? String((json as { message: unknown }).message)
          : `HTTP ${response.status}`;
      const msg = `Discord ${response.status}: ${raw}`;
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryFromBody =
        json && typeof json === 'object' && 'retry_after' in json
          ? Number((json as { retry_after: unknown }).retry_after)
          : NaN;
      const retrySec = Number(retryAfterHeader);
      const retryAfterMs = Number.isFinite(retrySec)
        ? Math.ceil(retrySec * 1000)
        : Number.isFinite(retryFromBody)
          ? Math.ceil(retryFromBody * 1000)
          : undefined;
      return { ok: false, status: response.status, message: msg, retryAfterMs };
    }
    return { ok: true, value: json };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      message: aborted
        ? 'Discord request timed out'
        : error instanceof Error
          ? error.message
          : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function retryWaitMs(result: DiscordFetchAttempt, attempt: number): number {
  const fallback = 1000 * (attempt + 1);
  const fromHeader = result.retryAfterMs;
  const waitMs = typeof fromHeader === 'number' && Number.isFinite(fromHeader) ? fromHeader : fallback;
  return Math.min(Math.max(waitMs, 250), 10_000);
}

async function discordFetch(
  token: string,
  method: string,
  route: string,
  body?: string | FormData | Uint8Array,
  contentType?: string,
  attempt = 0,
): Promise<DiscordResult<unknown>> {
  // FormData can only be read once — callers that need 429 retries with files
  // must rebuild the body (see postMessageWithAttachment).
  if (body instanceof FormData) {
    return discordFetchOnce(token, method, route, body, contentType);
  }
  const result = await discordFetchOnce(token, method, route, body, contentType);
  if (result.ok || result.status !== 429 || attempt >= 3) {
    return result;
  }
  await sleep(retryWaitMs(result, attempt));
  return discordFetch(token, method, route, body, contentType, attempt + 1);
}

function embedFallback(embeds: unknown): string {
  if (!Array.isArray(embeds) || embeds.length === 0) {
    return '';
  }
  const parts: string[] = [];
  for (const emb of embeds) {
    if (!emb || typeof emb !== 'object') {
      continue;
    }
    const e = emb as { title?: unknown; description?: unknown; author?: { name?: unknown } };
    if (typeof e.title === 'string' && e.title.trim()) {
      parts.push(e.title.trim());
    } else if (typeof e.description === 'string' && e.description.trim()) {
      parts.push(e.description.trim().slice(0, 160));
    } else if (e.author && typeof e.author.name === 'string' && e.author.name.trim()) {
      parts.push(e.author.name.trim());
    }
  }
  return parts.join(' · ');
}

function readMessageCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

function asThreadRef(raw: unknown): DiscordThreadRef | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const thread = raw as { id?: unknown; message_count?: unknown };
  if (typeof thread.id !== 'string') {
    return undefined;
  }
  const messageCount = readMessageCount(thread.message_count);
  return messageCount === undefined ? { id: thread.id } : { id: thread.id, messageCount };
}

function asMessage(raw: unknown): DiscordMessage | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string') {
    return undefined;
  }
  const thread = asThreadRef(m.thread);
  const attachments = Array.isArray(m.attachments)
    ? m.attachments
        .filter(
          (a): a is { id: string; filename: string; url: string } =>
            !!a &&
            typeof a === 'object' &&
            typeof (a as { id?: unknown }).id === 'string' &&
            typeof (a as { filename?: unknown }).filename === 'string' &&
            typeof (a as { url?: unknown }).url === 'string',
        )
        .map((a) => ({ id: a.id, filename: a.filename, url: a.url }))
    : undefined;
  const rawContent = typeof m.content === 'string' ? m.content : '';
  let content = rawContent;
  // Without Message Content Intent Discord often returns empty content — fall back to embeds/files only.
  // Never substitute the author handle for message text (that looked like “@user” chips).
  if (!content.trim()) {
    const fromEmbed = embedFallback(m.embeds);
    if (fromEmbed) {
      content = fromEmbed;
    } else if (attachments?.length) {
      content = attachments.map((a) => a.filename).join(', ');
    }
  }
  const author =
    m.author && typeof m.author === 'object'
      ? String((m.author as { username?: unknown }).username ?? '').trim()
      : '';
  return {
    id: m.id,
    content,
    author: author || undefined,
    timestamp: typeof m.timestamp === 'string' ? m.timestamp : '',
    type: typeof m.type === 'number' ? m.type : undefined,
    thread,
    attachments,
    hasThread: !!thread || m.has_thread === true,
    contentMissing: !content.trim(),
  };
}

function asMessages(raw: unknown): DiscordMessage[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(asMessage).filter((m): m is DiscordMessage => !!m);
}

/** Newest first from API → sort ascending (old top, new bottom). */
export function sortMessagesAsc(messages: DiscordMessage[]): DiscordMessage[] {
  return [...messages].sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      return a.timestamp.localeCompare(b.timestamp);
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function isMrMessage(content: string): boolean {
  const head = content.trimStart().split(/\r?\n/, 1)[0] || '';
  return MR_HEAD_RE.test(head);
}

export function isDraftMrMessage(content: string): boolean {
  const head = content.trimStart().split(/\r?\n/, 1)[0] || '';
  const match = MR_HEAD_RE.exec(head);
  return match?.[1] === DMR_PREFIX;
}

export function isReviewMessage(content: string): boolean {
  const head = content.trimStart().split(/\r?\n/, 1)[0] || '';
  return REVIEW_HEAD_RE.test(head);
}

export function isRereviewMessage(content: string): boolean {
  const head = content.trimStart().split(/\r?\n/, 1)[0] || '';
  return REREVIEW_HEAD_RE.test(head);
}

/** `R_SYN3` or `RR_SYN3`. Both take the next review number in a thread. */
export function isReviewFamilyMessage(content: string): boolean {
  return isReviewMessage(content) || isRereviewMessage(content);
}

/** Chosen items for a re-review. `all` is every bullet of that level. */
export type RereviewPick = number[] | 'all';
export type RereviewSelection = Partial<Record<ReviewLevel, RereviewPick>>;

/** Chip and file tail. Empty levels are omitted. Indexes use a space after the comma. */
export function formatRereviewSelection(selection: RereviewSelection): string {
  const parts: string[] = [];
  for (const level of ['H', 'M', 'L'] as const) {
    const pick = selection[level];
    if (!pick || (Array.isArray(pick) && pick.length === 0)) {
      continue;
    }
    if (pick === 'all') {
      parts.push(`${level}:all`);
      continue;
    }
    const nums = [...new Set(pick)].filter((item) => Number.isInteger(item) && item > 0).sort((a, b) => a - b);
    if (nums.length) {
      parts.push(`${level}:${nums.join(', ')}`);
    }
  }
  return parts.join(' | ');
}

/** `L:1, 2`, `H:all | L:1`, or the same text after `branch | rd |`. */
export function parseRereviewSelection(raw: string): RereviewSelection | undefined {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-') {
    return undefined;
  }
  const prefix = REVIEW_SCOPE_PREFIX_RE.exec(trimmed);
  const rest = (prefix ? trimmed.slice(prefix[0].length) : trimmed).trim();
  const parts = rest.split('|').map((item) => item.trim()).filter(Boolean);
  if (!parts.length) {
    return undefined;
  }
  const selection: RereviewSelection = {};
  for (const part of parts) {
    const match = REREVIEW_PART_RE.exec(part);
    const level = match ? reviewLevel(match[1]) : undefined;
    if (!match || !level || selection[level]) {
      return undefined;
    }
    if (match[2].toLowerCase() === 'all') {
      selection[level] = 'all';
      continue;
    }
    const nums = match[2]
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0);
    if (!nums.length) {
      return undefined;
    }
    selection[level] = [...new Set(nums)].sort((a, b) => a - b);
  }
  return selection;
}

export function formatOpenValue(bullets: ReviewFixBullets): string {
  const selection: RereviewSelection = {};
  for (const level of ['H', 'M', 'L'] as const) {
    if (bullets[level].length) {
      selection[level] = bullets[level];
    }
  }
  return formatRereviewSelection(selection) || '-';
}

/** `open:` indexes whose «Что чинить» is not «исправлено». `-` and a missing line are empty. */
export function parseOpenLine(content: string): ReviewFixBullets {
  const bullets = emptyFixBullets();
  const raw = metaLineValue(content, 'open');
  if (!raw || raw === '-') {
    return bullets;
  }
  const parsed = parseRereviewSelection(raw);
  if (!parsed) {
    return bullets;
  }
  for (const level of ['H', 'M', 'L'] as const) {
    const pick = parsed[level];
    if (Array.isArray(pick)) {
      bullets[level] = pick;
    }
  }
  return bullets;
}

export function isExplainMessage(content: string): boolean {
  const head = content.trimStart().split(/\r?\n/, 1)[0] || '';
  return EXPLAIN_HEAD_RE.test(head);
}

export function isScenarioGroupMessage(content: string): boolean {
  const head = content.trimStart().split(/\r?\n/, 1)[0] || '';
  return SCENARIO_GROUP_HEAD_RE.test(head.trim());
}

export function isScenarioMessage(content: string): boolean {
  const head = content.trimStart().split(/\r?\n/, 1)[0] || '';
  // A group hello also contains SCN_SYN3 as a bare marker — only the first line counts.
  return SCENARIO_HEAD_RE.test(head.trim()) && !isScenarioGroupMessage(content);
}

/** First severity line `H:n | M:n | L:n` in free text (agent stdout or file body). Legacy S → L. */
export function findSeverityLine(text: string): string | undefined {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const match = line.match(REVIEW_SEVERITY_RE);
    if (match) {
      return normalizeSeverityMatch(match);
    }
  }
  return undefined;
}

/**
 * Review attachment layout:
 * 1: Ревью N
 * 2: MR meta
 * 3: branch|changes | rl|rm|rd | H:N | M:N | L:N
 *    Older files may still say `rs` instead of `rl`.
 *    Older files keep a bare H:N | M:N | S:N on this line. S is Low.
 * rest: body
 */
export function parseReviewAttachment(text: string): {
  reviewNumber?: number;
  severity?: string;
  scope?: ReviewScopeToken;
  depth?: ReviewDepthToken;
  pillLabel?: string;
} {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const reviewLine = lines[0] || '';
  const numMatch = /^Ревью\s+(\d+)\b/i.exec(reviewLine) || /^Review\s+(\d+)\b/i.exec(reviewLine);
  const reviewNumber = numMatch ? Number(numMatch[1]) : undefined;
  const parsed = parseReviewSeverityLine(lines[2] || '');
  if (!parsed) {
    return { reviewNumber };
  }
  const n = reviewNumber ?? 0;
  const tail =
    parsed.scope && parsed.depth
      ? formatReviewScopeLine(parsed.scope, parsed.depth, parsed.severity)
      : parsed.severity;
  return {
    reviewNumber,
    severity: parsed.severity,
    scope: parsed.scope,
    depth: parsed.depth,
    pillLabel: `Ревью ${n} | ${tail}`,
  };
}

/** Download a Discord CDN attachment as UTF-8 text (bot token authorized). */
export async function fetchAttachmentText(
  token: string,
  url: string,
): Promise<DiscordResult<string>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, status: response.status, message: `HTTP ${response.status}` };
    }
    return { ok: true, value: await response.text() };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      message: aborted
        ? 'Discord request timed out'
        : error instanceof Error
          ? error.message
          : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function messageHasMrUrl(content: string, webUrl: string): boolean {
  if (!isMrMessage(content) || !webUrl) {
    return false;
  }
  return content.includes(webUrl.trim());
}

export async function listChannelMessages(
  token: string,
  channelId: string,
  opts: { limit?: number; before?: string; after?: string; around?: string } = {},
): Promise<DiscordResult<DiscordMessage[]>> {
  const params = new URLSearchParams();
  params.set('limit', String(Math.min(Math.max(opts.limit ?? 5, 1), 100)));
  if (opts.before) {
    params.set('before', opts.before);
  }
  if (opts.after) {
    params.set('after', opts.after);
  }
  if (opts.around) {
    params.set('around', opts.around);
  }
  const result = await discordFetch(
    token,
    'GET',
    `/channels/${channelId}/messages?${params.toString()}`,
  );
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: sortMessagesAsc(asMessages(result.value)) };
}

export async function listThreadMessages(
  token: string,
  threadId: string,
  opts: { limit?: number; before?: string; after?: string } = {},
): Promise<DiscordResult<DiscordMessage[]>> {
  return listChannelMessages(token, threadId, opts);
}

/**
 * Scan channel history (newest → older) for MR_SYN3 containing webUrl.
 * Caps pages to avoid runaway requests.
 */
export async function findMrMessage(
  token: string,
  channelId: string,
  webUrl: string,
  maxPages = 20,
): Promise<DiscordResult<DiscordMessage | undefined>> {
  let before: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await listChannelMessages(token, channelId, {
      limit: 100,
      before,
    });
    if (!batch.ok) {
      return batch;
    }
    // API returns newest first when unsorted; we sorted asc — search both ways.
    const hit = [...batch.value].reverse().find((m) => messageHasMrUrl(m.content, webUrl));
    if (hit) {
      return { ok: true, value: hit };
    }
    if (batch.value.length === 0) {
      return { ok: true, value: undefined };
    }
    before = batch.value[0]?.id;
    if (!before || batch.value.length < 100) {
      return { ok: true, value: undefined };
    }
  }
  return { ok: true, value: undefined };
}

export async function getChannelMessage(
  token: string,
  channelId: string,
  messageId: string,
): Promise<DiscordResult<DiscordMessage>> {
  const result = await discordFetch(token, 'GET', `/channels/${channelId}/messages/${messageId}`);
  if (!result.ok) {
    return result;
  }
  const msg = asMessage(result.value);
  if (!msg) {
    return { ok: false, status: 0, message: 'Invalid Discord message response' };
  }
  return { ok: true, value: msg };
}

export async function editChannelMessage(
  token: string,
  channelId: string,
  messageId: string,
  content: string,
): Promise<DiscordResult<DiscordMessage>> {
  const result = await discordFetch(
    token,
    'PATCH',
    `/channels/${channelId}/messages/${messageId}`,
    JSON.stringify({ content }),
    'application/json',
  );
  if (!result.ok) {
    return result;
  }
  const msg = asMessage(result.value);
  if (!msg) {
    return { ok: false, status: 0, message: 'Invalid Discord message response' };
  }
  return { ok: true, value: msg };
}

/** Replace the first line with `MR_SYN3:` / `DMR_SYN3:` and the host title. */
export function replaceMrDiscordHead(content: string, draft: boolean, title: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const prefix = draft ? DMR_PREFIX : MR_PREFIX;
  lines[0] = `${prefix}: ${title.trim()}`;
  return lines.join('\n');
}

/** Set or append a `key: value` line. Other lines stay as they are. */
export function replaceDiscordMetaLine(content: string, key: string, value: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const needle = `${key.toLowerCase()}:`;
  const next = `${key}: ${value}`;
  const idx = lines.findIndex((line) => line.trim().toLowerCase().startsWith(needle));
  if (idx >= 0) {
    lines[idx] = next;
  } else {
    lines.push(next);
  }
  return lines.join('\n');
}

/** Set or append the `color: #rrggbb` / `#rrggbbaa` line. Other lines stay as they are. */
export function replaceMrDiscordColor(content: string, color: string): string {
  return replaceDiscordMetaLine(content, 'color', color);
}

export type MrDiscordStatus = 'open' | 'closed';

/** Set or append `status: open|closed` on an MR/PR Discord message. */
export function replaceMrDiscordStatus(content: string, status: MrDiscordStatus): string {
  return replaceDiscordMetaLine(content, 'status', status);
}

const LOCK_LINE_RE = /^lock:\s*(true|false)\s*$/i;

/** `lock: true` fixes the parent. A missing line or `lock: false` stays open. */
export function parseDiscordLock(content: string): boolean {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = LOCK_LINE_RE.exec(line.trim());
    if (match) {
      return match[1].toLowerCase() === 'true';
    }
  }
  return false;
}

/** Set or append `lock: true|false`. Other lines stay as they are. */
export function replaceDiscordLock(content: string, locked: boolean): string {
  return replaceDiscordMetaLine(content, 'lock', locked ? 'true' : 'false');
}

export type ReviewChipStatus = 'inProgress' | 'done';

/** Set or append `status: -|inProgress|done` on an R_SYN3 message. */
export function replaceReviewDiscordStatus(content: string, status: ReviewChipStatus | '-'): string {
  return replaceDiscordMetaLine(content, 'status', status);
}

export type ReviewFixCounts = { H: number; M: number; L: number };
export type ReviewFixBullets = { H: number[]; M: number[]; L: number[] };

/** Counts, stamp, and 1-based bullet indexes stored on an R_SYN3 message. */
export type ReviewFixState = {
  counts: ReviewFixCounts;
  /** `ДД.ММ.ГГ чч:мм`. Absent while every count is zero. */
  at?: string;
  bullets: ReviewFixBullets;
};

const FIX_STAMP_RE = /^(\d{2}\.\d{2}\.\d{2} \d{2}:\d{2})$/;
const FIX_COUNT_RE = /^([HMLS]):\s*(\d+)$/i;
const FIX_BULLET_RE = /^([HMLS]):\s*([\d,\s]+)$/i;

export function emptyFixBullets(): ReviewFixBullets {
  return { H: [], M: [], L: [] };
}

export function emptyFixCounts(): ReviewFixCounts {
  return { H: 0, M: 0, L: 0 };
}

/** `ДД.ММ.ГГ чч:мм`, same shape as the map stamp. */
export function formatFixStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${String(date.getFullYear()).slice(-2)} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function parseFixCounts(value: string): { counts: ReviewFixCounts; at?: string } {
  const counts = emptyFixCounts();
  let at: string | undefined;
  for (const part of value.split('|').map((item) => item.trim()).filter(Boolean)) {
    const stamp = FIX_STAMP_RE.exec(part);
    if (stamp) {
      at = stamp[1];
      continue;
    }
    const count = FIX_COUNT_RE.exec(part);
    const level = count ? reviewLevel(count[1]) : undefined;
    if (!count || !level) {
      continue;
    }
    counts[level] = Number(count[2]);
  }
  return { counts, at };
}

function parseFixBullets(value: string): ReviewFixBullets {
  const bullets = emptyFixBullets();
  for (const part of value.split('|').map((item) => item.trim()).filter(Boolean)) {
    const match = FIX_BULLET_RE.exec(part);
    const level = match ? reviewLevel(match[1]) : undefined;
    if (!match || !level) {
      continue;
    }
    const nums = match[2]
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0);
    bullets[level] = [...new Set([...bullets[level], ...nums])].sort((a, b) => a - b);
  }
  return bullets;
}

/** `fixes:` plus optional `bullet:` on an R_SYN3 message. Missing `fixes:` means none. */
export function parseReviewFixes(content: string): ReviewFixState | undefined {
  const fixes = metaLineValue(content, 'fixes');
  if (fixes === undefined) {
    return undefined;
  }
  const parsed = parseFixCounts(fixes);
  const bullet = metaLineValue(content, 'bullet');
  return {
    counts: parsed.counts,
    at: parsed.at,
    bullets: bullet ? parseFixBullets(bullet) : emptyFixBullets(),
  };
}

export function formatFixesValue(counts: ReviewFixCounts, at?: string): string {
  const core = formatSeverityLine(counts.H, counts.M, counts.L);
  return at ? `${core} | ${at}` : core;
}

/** Groups with no indexes are omitted. */
export function formatBulletValue(bullets: ReviewFixBullets): string | undefined {
  const parts: string[] = [];
  for (const level of ['H', 'M', 'L'] as const) {
    const nums = [...new Set(bullets[level])].filter((item) => item > 0).sort((a, b) => a - b);
    if (nums.length) {
      parts.push(`${level}:${nums.join(',')}`);
    }
  }
  return parts.length ? parts.join(' | ') : undefined;
}

function removeDiscordMetaLine(content: string, key: string): string {
  const needle = `${key.toLowerCase()}:`;
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  return lines.filter((line) => !line.trim().toLowerCase().startsWith(needle)).join('\n');
}

/** Write `fixes:` and `bullet:` back onto an R_SYN3 message. An empty bullet line is removed. */
export function writeReviewFixes(content: string, state: ReviewFixState): string {
  let next = replaceDiscordMetaLine(content, 'fixes', formatFixesValue(state.counts, state.at));
  const bullet = formatBulletValue(state.bullets);
  if (!bullet) {
    return removeDiscordMetaLine(next, 'bullet');
  }
  return replaceDiscordMetaLine(next, 'bullet', bullet);
}

export async function postChannelMessage(
  token: string,
  channelId: string,
  content: string,
): Promise<DiscordResult<DiscordMessage>> {
  const result = await discordFetch(
    token,
    'POST',
    `/channels/${channelId}/messages`,
    JSON.stringify(messagePayload(content)),
    'application/json',
  );
  if (!result.ok) {
    return result;
  }
  const msg = asMessage(result.value);
  if (!msg) {
    return { ok: false, status: 0, message: 'Invalid Discord message response' };
  }
  return { ok: true, value: msg };
}

export async function deleteChannelMessage(
  token: string,
  channelId: string,
  messageId: string,
): Promise<DiscordResult<void>> {
  const result = await discordFetch(
    token,
    'DELETE',
    `/channels/${channelId}/messages/${messageId}`,
  );
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: undefined };
}

export async function startThread(
  token: string,
  channelId: string,
  messageId: string,
  name: string,
): Promise<DiscordResult<DiscordThreadRef>> {
  const safeName = name.replace(/[^\w\s\-./]/gu, '').trim().slice(0, 100) || 'MR review';
  const result = await discordFetch(
    token,
    'POST',
    `/channels/${channelId}/messages/${messageId}/threads`,
    JSON.stringify({ name: safeName, auto_archive_duration: 10080 }),
    'application/json',
  );
  if (!result.ok) {
    return result;
  }
  const thread = asThreadRef(result.value);
  if (!thread) {
    return { ok: false, status: 0, message: 'Invalid Discord thread response' };
  }
  return { ok: true, value: thread };
}

/** Ensure the parent message has a thread; return its id and message count. */
export async function ensureThread(
  token: string,
  channelId: string,
  message: DiscordMessage,
  threadName: string,
): Promise<DiscordResult<DiscordThreadRef>> {
  if (message.thread?.id) {
    return { ok: true, value: message.thread };
  }
  return startThread(token, channelId, message.id, threadName);
}

export async function postMessageWithFile(
  token: string,
  channelId: string,
  content: string,
  filePath: string,
): Promise<DiscordResult<DiscordMessage>> {
  const filename = path.basename(filePath);
  const bytes = await fs.readFile(filePath);
  return postMessageWithAttachment(token, channelId, content, filename, bytes);
}

/**
 * Raw multipart body. Extension-host fetch often drops or hangs on FormData/Blob
 * file parts, so the JSON config never appears in the channel.
 */
function encodeAttachmentMultipart(
  payload: string,
  filename: string,
  bytes: Uint8Array,
): { body: Uint8Array; contentType: string } {
  const boundary = `Syn3Boundary${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const safeName = filename.replace(/["\r\n]/g, '_');
  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="payload_json"\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${payload}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="files[0]"; filename="${safeName}"\r\n` +
      `Content-Type: application/json; charset=utf-8\r\n\r\n`,
    'utf8',
  );
  const ending = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const file = Buffer.from(bytes);
  return {
    body: Buffer.concat([preamble, file, ending]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/** Post a channel message with an in-memory attachment. */
export async function postMessageWithAttachment(
  token: string,
  channelId: string,
  content: string,
  filename: string,
  bytes: Uint8Array | Buffer,
): Promise<DiscordResult<DiscordMessage>> {
  const payload = JSON.stringify({
    ...messagePayload(content),
    attachments: [{ id: 0, filename }],
  });
  const fileBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const encoded = encodeAttachmentMultipart(payload, filename, fileBytes);
  let last: DiscordFetchAttempt = { ok: false, status: 0, message: 'Upload failed' };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    last = await discordFetchOnce(
      token,
      'POST',
      `/channels/${channelId}/messages`,
      encoded.body,
      encoded.contentType,
    );
    if (last.ok) {
      const msg = asMessage(last.value);
      if (!msg) {
        return { ok: false, status: 0, message: 'Invalid Discord message response' };
      }
      const attached = msg.attachments?.some((file) => file.filename === filename);
      if (!attached) {
        return {
          ok: false,
          status: 0,
          message: `Discord accepted the message but did not attach ${filename}`,
        };
      }
      return { ok: true, value: msg };
    }
    if (last.status !== 429 || attempt >= 5) {
      return { ok: false, status: last.status, message: last.message };
    }
    await sleep(retryWaitMs(last, attempt));
  }
  return { ok: false, status: last.status, message: last.message };
}

/** Strip `.git` and trailing slash from a repo URL. */
export function normalizeRepoWebUrl(repoUrl: string): string {
  return repoUrl.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
}

/** Path label without host: `group/app` or `owner/repo`. */
export function repoPathLabel(repoUrl: string): string {
  const raw = normalizeRepoWebUrl(repoUrl);
  const ssh = /^git@[^:]+:(.+)$/.exec(raw);
  if (ssh) {
    return ssh[1].replace(/\.git$/i, '');
  }
  const sshUrl = /^ssh:\/\/[^/]+\/(.+)$/.exec(raw);
  if (sshUrl) {
    return sshUrl[1].replace(/\.git$/i, '');
  }
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return u.pathname.replace(/^\/+/, '').replace(/\.git$/i, '');
  } catch {
    return raw;
  }
}

function mdLink(label: string, url: string): string {
  return `[${label}](${url})`;
}

function firstMdLinkUrl(line: string): string | undefined {
  const match = MD_LINK_RE.exec(line);
  return match?.[2]?.trim() || undefined;
}

function branchTreeUrl(provider: 'gitlab' | 'github', repoUrl: string, branch: string): string {
  const base = normalizeRepoWebUrl(repoUrl);
  const encoded = branch
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return provider === 'github' ? `${base}/tree/${encoded}` : `${base}/-/tree/${encoded}`;
}

/**
 * Human-readable MR/PR body for Discord. First line carries the parse marker.
 *
 * DMR_SYN3: Title
 * MR: [MR !12](url)
 * Branch: [branch](tree-url)
 * Repository: [group/app](repo-url)
 * Review author: Profile
 * Assignees: A, B
 * color: #hex
 * status: open|closed
 * lock: true|false
 */
export function formatMrDiscordBody(opts: {
  webUrl: string;
  title: string;
  draft: boolean;
  color: string;
  provider: 'gitlab' | 'github';
  iid: number;
  sourceBranch: string;
  repoUrl: string;
  reviewAuthor: string;
  assignees: string[];
}): string {
  const repo = normalizeRepoWebUrl(opts.repoUrl);
  const kindLabel = opts.provider === 'github' ? 'PR' : 'MR';
  const iidLabel =
    opts.provider === 'github' ? `PR #${opts.iid}` : `MR !${opts.iid}`;
  const prefix = opts.draft ? DMR_PREFIX : MR_PREFIX;
  const assignees =
    opts.assignees.length > 0 ? opts.assignees.join(', ') : '—';
  const author = opts.reviewAuthor.trim() || '—';
  const branch = opts.sourceBranch.trim() || '—';
  const lines = [
    `${prefix}: ${opts.title.trim() || iidLabel}`,
    `${kindLabel}: ${mdLink(iidLabel, opts.webUrl.trim())}`,
    `Branch: ${
      opts.sourceBranch.trim()
        ? mdLink(branch, branchTreeUrl(opts.provider, repo, opts.sourceBranch.trim()))
        : '—'
    }`,
    `Repository: ${mdLink(repoPathLabel(repo) || repo, repo)}`,
    `Review author: ${author}`,
    `Assignees: ${assignees}`,
    `color: ${opts.color}`,
    'status: open',
    'lock: false',
  ];
  return lines.join('\n');
}

export function parseMrChip(content: string): {
  webUrl?: string;
  title?: string;
  draft?: boolean;
  color?: string;
  /** Missing `status:` means open. */
  status?: MrDiscordStatus;
} {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const head = lines[0] || '';
  const headMatch = MR_HEAD_RE.exec(head);
  if (!headMatch) {
    return {};
  }
  const draft = headMatch[1] === DMR_PREFIX;
  const title = (headMatch[2] || '').trim() || undefined;
  const mrLine = lines.find((l) => /^(?:MR|МР|PR)\s*:/i.test(l));
  const webUrl = mrLine ? firstMdLinkUrl(mrLine) : undefined;
  const colorLine = lines.find((l) => l.toLowerCase().startsWith('color:'));
  const colorRaw = colorLine ? colorLine.slice(6).trim() : undefined;
  const color = colorRaw && /^#[0-9a-fA-F]{3,8}$/.test(colorRaw) ? colorRaw : undefined;
  const statusLine = lines.find((l) => l.toLowerCase().startsWith('status:'));
  const statusRaw = statusLine ? statusLine.slice(7).trim().toLowerCase() : '';
  const status: MrDiscordStatus = statusRaw === 'closed' ? 'closed' : 'open';
  return { webUrl, title, draft, color, status };
}

/**
 * Discord message for a review file attachment.
 *
 * Thread reply (under MR or under a root review):
 * R_SYN3: Ревью N | branch | rd | H:n | M:n | L:n
 * Model: …
 * Skill: …
 * fixes: H:0 | M:0 | L:0
 * status: -|inProgress|done
 *
 * Channel root (no MR):
 * R_SYN3: Ревью N | branch | rd | H:n | M:n | L:n
 * Branch: name
 * Model: …
 * Skill: …
 * color: #hex
 * fixes: H:0 | M:0 | L:0
 * status: -
 * lock: false
 *
 * Older messages omit kind and depth: `Ревью N | H:n | M:n | S:n`. S is Low.
 * After a neurofix the fixes line gains a stamp and a `bullet:` line lists 1-based indexes.
 */
export function formatReviewDiscordBody(opts: {
  reviewNumber: number;
  severity: string;
  scope?: ReviewScopeToken;
  depth?: ReviewDepthToken;
  model: string;
  skillPath: string;
  branch?: string;
  color?: string;
}): string {
  const parsed = parseReviewSeverityLine(opts.severity);
  const severity = parsed?.severity ?? formatSeverityLine(0, 0, 0);
  const scope = opts.scope ?? parsed?.scope;
  const depth = opts.depth ?? parsed?.depth;
  const tail = scope && depth ? formatReviewScopeLine(scope, depth, severity) : severity;
  const model = opts.model.trim() || '—';
  const skill = opts.skillPath.trim() || '—';
  const lines = [`${REVIEW_PREFIX}: Ревью ${opts.reviewNumber} | ${tail}`];
  const branch = opts.branch?.trim();
  if (branch) {
    lines.push(`Branch: ${branch}`);
  }
  lines.push(`Model: ${model}`, `Skill: ${skill}`);
  const color = opts.color?.trim();
  if (color) {
    lines.push(`color: ${color}`);
  }
  lines.push(`fixes: ${formatFixesValue(emptyFixCounts())}`);
  lines.push('status: -');
  if (branch) {
    lines.push('lock: false');
  }
  return lines.join('\n');
}

/**
 * Thread reply that re-checks selected bullets of an existing review.
 *
 * RR_SYN3: Реревью N на Ревью K | branch | rd | L:1, 2
 * Model: …
 * Skill: …
 * open: L:1, 2
 * status: -
 *
 * No `fixes:` until a neurofix runs. `open: -` means every selected row is «исправлено».
 */
export function formatRereviewDiscordBody(opts: {
  reviewNumber: number;
  parentNumber: number;
  scope: ReviewScopeToken;
  depth: ReviewDepthToken;
  selection: string;
  open: ReviewFixBullets;
  model: string;
  skillPath: string;
}): string {
  const model = opts.model.trim() || '—';
  const skill = opts.skillPath.trim() || '—';
  const selection = opts.selection.trim();
  return [
    `${REREVIEW_PREFIX}: Реревью ${opts.reviewNumber} на Ревью ${opts.parentNumber} | ${opts.scope} | ${opts.depth} | ${selection}`,
    `Model: ${model}`,
    `Skill: ${skill}`,
    `open: ${formatOpenValue(opts.open)}`,
    'status: -',
  ].join('\n');
}

/**
 * Discord message for an explain («Что сделано») file attachment.
 *
 * Channel root or thread reply:
 * W_SYN3: Что сделано | branch | rl
 * Branch: name
 * Model: …
 * Skill: …
 * color: #hex
 *
 * Older messages say `Что делаем?` or omit scope and depth.
 * The chip always shows `Что сделано`.
 */
export function formatExplainDiscordBody(opts: {
  model: string;
  skillPath: string;
  branch: string;
  scope: ReviewScopeToken;
  depth: ReviewDepthToken;
  color?: string;
}): string {
  const model = opts.model.trim() || '—';
  const skill = opts.skillPath.trim() || '—';
  const branch = opts.branch.trim() || '—';
  const color = (opts.color?.trim() || EXPLAIN_DEFAULT_COLOR).trim();
  return [
    `${EXPLAIN_PREFIX}: ${EXPLAIN_TITLE} | ${opts.scope} | ${opts.depth}`,
    `Branch: ${branch}`,
    `Model: ${model}`,
    `Skill: ${skill}`,
    `color: ${color}`,
  ].join('\n');
}

const EXPLAIN_PILL_RE =
  /^(?:Что сделано|Что делаем\?)\s*\|\s*(branch|changes?)\s*\|\s*(rs|rl|rm|rd)\s*$/i;

/** Chip label from a W_SYN3 Discord message. */
export function parseExplainMessagePill(content: string): string | undefined {
  const head = content.trimStart().split(/\r?\n/, 1)[0] || '';
  const match = EXPLAIN_HEAD_RE.exec(head);
  if (!match) {
    return undefined;
  }
  const rest = (match[1] || '').trim().replace(/\s+/g, ' ');
  const scoped = EXPLAIN_PILL_RE.exec(rest);
  if (!scoped) {
    return EXPLAIN_TITLE;
  }
  const scope = normalizeReviewScopeToken(scoped[1]);
  if (!scope) {
    return EXPLAIN_TITLE;
  }
  return `${EXPLAIN_TITLE} | ${scope} | ${scoped[2].toLowerCase()}`;
}

/** Branch name from a `Branch:` line. Older messages use `Ветка:`. A markdown link keeps only its text. */
const REVIEW_BRANCH_LINE_RE = /^(?:Branch|Ветка)\s*:/i;

export function parseReviewBranch(content: string): string | undefined {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => REVIEW_BRANCH_LINE_RE.test(l));
  if (!line) {
    return undefined;
  }
  const value = line.replace(REVIEW_BRANCH_LINE_RE, '').trim();
  if (!value || value === '—') {
    return undefined;
  }
  const linked = /^\[([^\]]+)\]\([^)]+\)$/.exec(value);
  const name = (linked ? linked[1] : value).trim();
  if (!name || name === '—') {
    return undefined;
  }
  return name;
}

/** `color:` on an R_SYN3 message (root review). */
export function parseReviewColor(content: string): string | undefined {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const colorLine = lines.find((l) => l.toLowerCase().startsWith('color:'));
  const colorRaw = colorLine ? colorLine.slice(6).trim() : undefined;
  return colorRaw && /^#[0-9a-fA-F]{3,8}$/.test(colorRaw) ? colorRaw : undefined;
}

/** `status:` on an R_SYN3 message. `-` and a missing line are the empty default. */
export function parseReviewStatus(content: string): ReviewChipStatus | undefined {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const statusLine = lines.find((l) => l.toLowerCase().startsWith('status:'));
  const raw = statusLine ? statusLine.slice(7).trim().toLowerCase() : '';
  if (raw === 'inprogress') {
    return 'inProgress';
  }
  if (raw === 'done') {
    return 'done';
  }
  return undefined;
}

/** Pill label from the first line of a review Discord message. */
export function parseReviewMessagePill(content: string): string | undefined {
  const head = content.trimStart().split(/\r?\n/, 1)[0] || '';
  const match = REVIEW_HEAD_RE.exec(head);
  if (!match) {
    return undefined;
  }
  const rest = (match[1] || '').trim().replace(/\s+/g, ' ');
  const scoped =
    /^(?:Ревью|Review)\s+(\d+)\s*\|\s*(branch|changes?)\s*\|\s*(rs|rl|rm|rd)\s*\|\s*(H:\s*\d+\s*\|\s*M:\s*\d+\s*\|\s*[LS]:\s*\d+)$/i.exec(
      rest,
    );
  if (scoped) {
    const sev = scoped[4].match(REVIEW_SEVERITY_RE);
    const scope = normalizeReviewScopeToken(scoped[2]);
    if (!sev || !scope) {
      return undefined;
    }
    return `Ревью ${scoped[1]} | ${scope} | ${scoped[3].toLowerCase()} | ${normalizeSeverityMatch(sev)}`;
  }
  const plain =
    /^(?:Ревью|Review)\s+(\d+)\s*\|\s*(H:\s*\d+\s*\|\s*M:\s*\d+\s*\|\s*[LS]:\s*\d+)$/i.exec(rest);
  if (!plain) {
    return undefined;
  }
  const sev = plain[2].match(REVIEW_SEVERITY_RE);
  if (!sev) {
    return undefined;
  }
  return `Ревью ${plain[1]} | ${normalizeSeverityMatch(sev)}`;
}

/** Pill label from the first line of an RR_SYN3 message. */
export function parseRereviewMessagePill(content: string): string | undefined {
  const head = content.trimStart().split(/\r?\n/, 1)[0] || '';
  const match = REREVIEW_HEAD_RE.exec(head);
  if (!match) {
    return undefined;
  }
  const rest = (match[1] || '').trim().replace(/\s+/g, ' ');
  const scoped =
    /^(?:Реревью|Rereview)\s+(\d+)\s+на\s+(?:Ревью|Review)\s+(\d+)\s*\|\s*(branch|changes?)\s*\|\s*(rs|rl|rm|rd)\s*\|\s*(.+)$/i.exec(
      rest,
    );
  if (!scoped) {
    return undefined;
  }
  const scope = normalizeReviewScopeToken(scoped[3]);
  const selection = parseRereviewSelection(scoped[5]);
  const formatted = selection ? formatRereviewSelection(selection) : '';
  if (!scope || !formatted) {
    return undefined;
  }
  return `Реревью ${scoped[1]} на Ревью ${scoped[2]} | ${scope} | ${scoped[4].toLowerCase()} | ${formatted}`;
}

/** Parent review number from a re-review pill, e.g. `Реревью 4 на Ревью 1 | …`. */
export function parseRereviewParentNumber(pill: string): number | undefined {
  const match = /на\s+(?:Ревью|Review)\s+(\d+)/i.exec(pill);
  return match ? Number(match[1]) : undefined;
}

export type ScenarioGroupStatus = 'open' | 'lock';

function metaLineValue(content: string, key: string): string | undefined {
  const needle = `${key.toLowerCase()}:`;
  for (const raw of content.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line.toLowerCase().startsWith(needle)) {
      continue;
    }
    return line.slice(needle.length).trim();
  }
  return undefined;
}

/**
 * GRSCN_SYN3
 * date: …
 * title: …
 * counter: n
 * status: open|lock
 * alias:
 * description:
 * color: #hex
 */
export function formatScenarioGroupDiscordBody(opts: {
  title: string;
  color: string;
  date?: string;
  counter?: number;
  status?: ScenarioGroupStatus;
  alias?: string;
  description?: string;
}): string {
  const date = opts.date?.trim() || formatConfigHeaderDate();
  const title = opts.title.trim() || SCENARIO_GROUP_DEFAULT_TITLE;
  const color = opts.color.trim() || '#8e4ec6';
  const counter = Math.max(0, Math.floor(opts.counter ?? 0));
  const status: ScenarioGroupStatus = opts.status === 'lock' ? 'lock' : 'open';
  return [
    SCENARIO_GROUP_PREFIX,
    `date: ${date}`,
    `title: ${title}`,
    `counter: ${counter}`,
    `status: ${status}`,
    `alias: ${(opts.alias || '').trim()}`,
    `description: ${(opts.description || '').trim()}`,
    `color: ${color}`,
  ].join('\n');
}

export function parseScenarioGroupChip(content: string): {
  title?: string;
  date?: string;
  counter?: number;
  status?: ScenarioGroupStatus;
  alias?: string;
  description?: string;
  color?: string;
} {
  if (!isScenarioGroupMessage(content)) {
    return {};
  }
  const title = metaLineValue(content, 'title');
  const date = metaLineValue(content, 'date');
  const alias = metaLineValue(content, 'alias');
  const description = metaLineValue(content, 'description');
  const colorRaw = metaLineValue(content, 'color');
  const color = colorRaw && /^#[0-9a-fA-F]{3,8}$/.test(colorRaw) ? colorRaw : undefined;
  const counterRaw = metaLineValue(content, 'counter');
  const counter =
    counterRaw && /^\d+$/.test(counterRaw) ? Number(counterRaw) : undefined;
  const statusRaw = (metaLineValue(content, 'status') || '').toLowerCase();
  const status: ScenarioGroupStatus = statusRaw === 'lock' ? 'lock' : 'open';
  return {
    ...(title !== undefined ? { title } : {}),
    ...(date ? { date } : {}),
    ...(counter !== undefined ? { counter } : {}),
    status,
    ...(alias !== undefined ? { alias } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(color ? { color } : {}),
  };
}

/**
 * SCN_SYN3
 * date: …
 * title: …
 * steep: n
 * order: n   (group thread only)
 */
export function formatScenarioDiscordBody(opts: {
  title: string;
  date?: string;
  steep?: number;
  order?: number;
}): string {
  const date = opts.date?.trim() || formatConfigHeaderDate();
  const title = opts.title.trim() || SCENARIO_DEFAULT_TITLE;
  const steep = Math.max(0, Math.floor(opts.steep ?? 0));
  const lines = [
    SCENARIO_PREFIX,
    `date: ${date}`,
    `title: ${title}`,
    `steep: ${steep}`,
  ];
  if (opts.order !== undefined) {
    lines.push(`order: ${Math.max(1, Math.floor(opts.order))}`);
  }
  return lines.join('\n');
}

export function parseScenarioChip(content: string): {
  title?: string;
  date?: string;
  steep?: number;
  order?: number;
} {
  if (!isScenarioMessage(content)) {
    return {};
  }
  const title = metaLineValue(content, 'title');
  const date = metaLineValue(content, 'date');
  const steepRaw = metaLineValue(content, 'steep');
  const orderRaw = metaLineValue(content, 'order');
  const steep = steepRaw && /^\d+$/.test(steepRaw) ? Number(steepRaw) : undefined;
  const order = orderRaw && /^\d+$/.test(orderRaw) ? Number(orderRaw) : undefined;
  return {
    ...(title !== undefined ? { title } : {}),
    ...(date ? { date } : {}),
    ...(steep !== undefined ? { steep } : {}),
    ...(order !== undefined ? { order } : {}),
  };
}

/** Count mermaid call/return arrows for the `steep:` field. */
export function countScenarioSteeps(md: string): number {
  let count = 0;
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%') || trimmed.startsWith('sequenceDiagram')) {
      continue;
    }
    if (/->>|-->>/.test(trimmed)) {
      count += 1;
    }
  }
  return count;
}

/** Edit a Discord message and attach (or replace) a file. */
export async function editMessageWithFile(
  token: string,
  channelId: string,
  messageId: string,
  content: string,
  filePath: string,
): Promise<DiscordResult<DiscordMessage>> {
  const filename = path.basename(filePath);
  const bytes = await fs.readFile(filePath);
  return editMessageWithAttachment(token, channelId, messageId, content, filename, bytes);
}

export async function editMessageWithAttachment(
  token: string,
  channelId: string,
  messageId: string,
  content: string,
  filename: string,
  bytes: Uint8Array | Buffer,
): Promise<DiscordResult<DiscordMessage>> {
  const payload = JSON.stringify({
    ...messagePayload(content),
    attachments: [{ id: 0, filename }],
  });
  const fileBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const encoded = encodeAttachmentMultipart(payload, filename, fileBytes);
  let last: DiscordFetchAttempt = { ok: false, status: 0, message: 'Upload failed' };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    last = await discordFetchOnce(
      token,
      'PATCH',
      `/channels/${channelId}/messages/${messageId}`,
      encoded.body,
      encoded.contentType,
    );
    if (last.ok) {
      const msg = asMessage(last.value);
      if (!msg) {
        return { ok: false, status: 0, message: 'Invalid Discord message response' };
      }
      return { ok: true, value: msg };
    }
    if (last.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    break;
  }
  return last.ok
    ? { ok: false, status: 0, message: 'Invalid Discord message response' }
    : last;
}
