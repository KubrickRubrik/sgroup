import * as fs from 'fs/promises';
import * as path from 'path';

const API = 'https://discord.com/api/v10';
export const MR_PREFIX = 'MR_SYN3';
/** Draft merge-request message prefix (same chip family as MR_SYN3). */
export const DMR_PREFIX = 'DMR_SYN3';
/** Review message prefix in Discord threads: `R_SYN3: Ревью N | H:…`. */
export const REVIEW_PREFIX = 'R_SYN3';
/** Explain («Что делаем?») message prefix: `W_SYN3: Что делаем?`. */
export const EXPLAIN_PREFIX = 'W_SYN3';
/** Chip and file title for an explain message. */
export const EXPLAIN_TITLE = 'Что делаем?';
/** Default chip color for explain messages (Violet). */
export const EXPLAIN_DEFAULT_COLOR = '#8e4ec6';
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
/**
 * Severity line inside a review file / agent stdout.
 * Canonical form is `H:n | M:n | S:n`. Legacy `L` (former low) maps to `S`.
 */
export const REVIEW_SEVERITY_RE =
  /^H:\s*(\d+)\s*\|\s*M:\s*(\d+)\s*\|\s*([LS]):\s*(\d+)\s*$/i;

/** Format a normalized severity line. Legacy L counts become S. */
export function formatSeverityLine(h: string | number, m: string | number, s: string | number): string {
  return `H:${h} | M:${m} | S:${s}`;
}

/** Match a severity line and return the canonical `H:n | M:n | S:n` form. */
export function normalizeSeverityMatch(match: RegExpMatchArray): string {
  return formatSeverityLine(match[1], match[2], match[4]);
}

const MR_HEAD_RE = /^\(?((?:MR_SYN3|DMR_SYN3))\)?:\s*(.*)$/;
const REVIEW_HEAD_RE = /^\(?R_SYN3\)?:\s*(.*)$/;
const EXPLAIN_HEAD_RE = /^\(?W_SYN3\)?:\s*(.*)$/;
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

export function isExplainMessage(content: string): boolean {
  const head = content.trimStart().split(/\r?\n/, 1)[0] || '';
  return EXPLAIN_HEAD_RE.test(head);
}

/** First severity line `H:n | M:n | S:n` in free text (agent stdout or file body). Legacy L → S. */
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
 * 3: H:N | M:N | S:N
 * rest: body
 */
export function parseReviewAttachment(text: string): {
  reviewNumber?: number;
  severity?: string;
  pillLabel?: string;
} {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const reviewLine = lines[0] || '';
  const numMatch = /^Ревью\s+(\d+)\b/i.exec(reviewLine) || /^Review\s+(\d+)\b/i.exec(reviewLine);
  const reviewNumber = numMatch ? Number(numMatch[1]) : undefined;
  const severityRaw = lines[2] || '';
  const sevMatch = severityRaw.match(REVIEW_SEVERITY_RE);
  if (!sevMatch) {
    return { reviewNumber };
  }
  const severity = normalizeSeverityMatch(sevMatch);
  const n = reviewNumber ?? 0;
  return {
    reviewNumber,
    severity,
    pillLabel: `Ревью ${n} | ${severity}`,
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
  opts: { limit?: number; before?: string } = {},
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
 * МР: [МР !12](url)
 * Ветка: [branch](tree-url)
 * Репозиторий: [group/app](repo-url)
 * Автор ревью: Profile
 * Исполнители: A, B
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
  const kindLabel = opts.provider === 'github' ? 'PR' : 'МР';
  const iidLabel =
    opts.provider === 'github' ? `PR #${opts.iid}` : `МР !${opts.iid}`;
  const prefix = opts.draft ? DMR_PREFIX : MR_PREFIX;
  const assignees =
    opts.assignees.length > 0 ? opts.assignees.join(', ') : '—';
  const author = opts.reviewAuthor.trim() || '—';
  const branch = opts.sourceBranch.trim() || '—';
  const lines = [
    `${prefix}: ${opts.title.trim() || iidLabel}`,
    `${kindLabel}: ${mdLink(iidLabel, opts.webUrl.trim())}`,
    `Ветка: ${
      opts.sourceBranch.trim()
        ? mdLink(branch, branchTreeUrl(opts.provider, repo, opts.sourceBranch.trim()))
        : '—'
    }`,
    `Репозиторий: ${mdLink(repoPathLabel(repo) || repo, repo)}`,
    `Автор ревью: ${author}`,
    `Исполнители: ${assignees}`,
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
  const mrLine = lines.find((l) => /^(МР|PR)\s*:/i.test(l));
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
 * R_SYN3: Ревью N | H:n | M:n | S:n
 * Модель: …
 * Скилл: …
 * status: -|inProgress|done
 *
 * Channel root (no MR):
 * R_SYN3: Ревью N | H:n | M:n | S:n
 * Ветка: name
 * Модель: …
 * Скилл: …
 * color: #hex
 * status: -
 * lock: false
 */
export function formatReviewDiscordBody(opts: {
  reviewNumber: number;
  severity: string;
  model: string;
  skillPath: string;
  branch?: string;
  color?: string;
}): string {
  const raw = opts.severity.trim();
  const matched = raw.match(REVIEW_SEVERITY_RE);
  const severity = matched ? normalizeSeverityMatch(matched) : formatSeverityLine(0, 0, 0);
  const model = opts.model.trim() || '—';
  const skill = opts.skillPath.trim() || '—';
  const lines = [`${REVIEW_PREFIX}: Ревью ${opts.reviewNumber} | ${severity}`];
  const branch = opts.branch?.trim();
  if (branch) {
    lines.push(`Ветка: ${branch}`);
  }
  lines.push(`Модель: ${model}`, `Скилл: ${skill}`);
  const color = opts.color?.trim();
  if (color) {
    lines.push(`color: ${color}`);
  }
  lines.push('status: -');
  if (branch) {
    lines.push('lock: false');
  }
  return lines.join('\n');
}

/**
 * Discord message for an explain («Что делаем?») file attachment.
 *
 * Channel root or thread reply:
 * W_SYN3: Что делаем?
 * Ветка: name
 * Модель: …
 * Скилл: …
 * color: #hex
 */
export function formatExplainDiscordBody(opts: {
  model: string;
  skillPath: string;
  branch: string;
  color?: string;
}): string {
  const model = opts.model.trim() || '—';
  const skill = opts.skillPath.trim() || '—';
  const branch = opts.branch.trim() || '—';
  const color = (opts.color?.trim() || EXPLAIN_DEFAULT_COLOR).trim();
  return [
    `${EXPLAIN_PREFIX}: ${EXPLAIN_TITLE}`,
    `Ветка: ${branch}`,
    `Модель: ${model}`,
    `Скилл: ${skill}`,
    `color: ${color}`,
  ].join('\n');
}

/** Chip label from a W_SYN3 Discord message. */
export function parseExplainMessagePill(content: string): string | undefined {
  const head = content.trimStart().split(/\r?\n/, 1)[0] || '';
  const match = EXPLAIN_HEAD_RE.exec(head);
  if (!match) {
    return undefined;
  }
  return EXPLAIN_TITLE;
}

/** Branch name from a `Ветка:` line. A markdown link keeps only its text. */
export function parseReviewBranch(content: string): string | undefined {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => /^Ветка\s*:/i.test(l));
  if (!line) {
    return undefined;
  }
  const value = line.replace(/^Ветка\s*:/i, '').trim();
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
  const rest = (match[1] || '').trim();
  const pill =
    /^Ревью\s+\d+\s*\|\s*H:\s*\d+\s*\|\s*M:\s*\d+\s*\|\s*[LS]:\s*\d+$/i.exec(rest) ||
    /^Review\s+\d+\s*\|\s*H:\s*\d+\s*\|\s*M:\s*\d+\s*\|\s*[LS]:\s*\d+$/i.exec(rest);
  if (!pill) {
    return undefined;
  }
  const normalized = rest.replace(/\s+/g, ' ');
  const sev = normalized.match(/H:\s*(\d+)\s*\|\s*M:\s*(\d+)\s*\|\s*([LS]):\s*(\d+)/i);
  const num = normalized.match(/^(?:Ревью|Review)\s+(\d+)/i);
  if (!sev || !num) {
    return undefined;
  }
  return `Ревью ${num[1]} | ${normalizeSeverityMatch(sev)}`;
}
