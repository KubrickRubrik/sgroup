import * as fs from 'fs/promises';
import * as path from 'path';

const API = 'https://discord.com/api/v10';
export const MR_PREFIX = 'MR_SYN3';
/** Draft merge-request message prefix (same chip family as MR_SYN3). */
export const DMR_PREFIX = 'DMR_SYN3';
export const REVIEW_PREFIX = 'R-SYN3';
/** Severity line inside a review file / agent stdout. */
export const REVIEW_SEVERITY_RE = /^H:\s*(\d+)\s*\|\s*M:\s*(\d+)\s*\|\s*L:\s*(\d+)\s*$/i;

export interface DiscordMessage {
  id: string;
  content: string;
  /** Discord username when present (not a substitute for message text). */
  author?: string;
  timestamp: string;
  /** Present when the message starts a thread. */
  thread?: { id: string };
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

async function discordFetch(
  token: string,
  method: string,
  route: string,
  body?: string | FormData,
  contentType?: string,
  attempt = 0,
): Promise<DiscordResult<unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bot ${token}`,
  };
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  try {
    const response = await fetch(`${API}${route}`, {
      method,
      headers,
      body,
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
    if (response.status === 429 && attempt < 3) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryFromBody =
        json && typeof json === 'object' && 'retry_after' in json
          ? Number((json as { retry_after: unknown }).retry_after)
          : NaN;
      const retrySec = Number(retryAfterHeader);
      const waitMs = Number.isFinite(retrySec)
        ? Math.ceil(retrySec * 1000)
        : Number.isFinite(retryFromBody)
          ? Math.ceil(retryFromBody * 1000)
          : 1000 * (attempt + 1);
      await sleep(Math.min(Math.max(waitMs, 250), 10_000));
      return discordFetch(token, method, route, body, contentType, attempt + 1);
    }
    if (!response.ok) {
      const msg =
        json && typeof json === 'object' && 'message' in json
          ? String((json as { message: unknown }).message)
          : `HTTP ${response.status}`;
      return { ok: false, status: response.status, message: msg };
    }
    return { ok: true, value: json };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : String(error),
    };
  }
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

function asMessage(raw: unknown): DiscordMessage | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string') {
    return undefined;
  }
  const thread =
    m.thread && typeof m.thread === 'object' && typeof (m.thread as { id?: unknown }).id === 'string'
      ? { id: (m.thread as { id: string }).id }
      : undefined;
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
  const head = content.trimStart();
  return head.startsWith(MR_PREFIX) || head.startsWith(DMR_PREFIX);
}

export function isDraftMrMessage(content: string): boolean {
  return content.trimStart().startsWith(DMR_PREFIX);
}

export function isReviewMessage(content: string): boolean {
  return content.trimStart().startsWith(REVIEW_PREFIX);
}

/** First severity line `H:n | M:n | L:n` in free text (agent stdout or file body). */
export function findSeverityLine(text: string): string | undefined {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (REVIEW_SEVERITY_RE.test(line)) {
      const match = line.match(REVIEW_SEVERITY_RE);
      if (match) {
        return `H:${match[1]} | M:${match[2]} | L:${match[3]}`;
      }
    }
  }
  return undefined;
}

/**
 * Review attachment layout:
 * 1: Ревью N
 * 2: MR meta
 * 3: H:N | M:N | L:N
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
  const severity = `H:${sevMatch[1]} | M:${sevMatch[2]} | L:${sevMatch[3]}`;
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
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!response.ok) {
      return { ok: false, status: response.status, message: `HTTP ${response.status}` };
    }
    return { ok: true, value: await response.text() };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : String(error),
    };
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

export async function postChannelMessage(
  token: string,
  channelId: string,
  content: string,
): Promise<DiscordResult<DiscordMessage>> {
  const result = await discordFetch(
    token,
    'POST',
    `/channels/${channelId}/messages`,
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

export async function startThread(
  token: string,
  channelId: string,
  messageId: string,
  name: string,
): Promise<DiscordResult<{ id: string }>> {
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
  const id =
    result.value && typeof result.value === 'object' && typeof (result.value as { id?: unknown }).id === 'string'
      ? (result.value as { id: string }).id
      : undefined;
  if (!id) {
    return { ok: false, status: 0, message: 'Invalid Discord thread response' };
  }
  return { ok: true, value: { id } };
}

/** Ensure the parent message has a thread; return thread id. */
export async function ensureThread(
  token: string,
  channelId: string,
  message: DiscordMessage,
  threadName: string,
): Promise<DiscordResult<string>> {
  if (message.thread?.id) {
    return { ok: true, value: message.thread.id };
  }
  const created = await startThread(token, channelId, message.id, threadName);
  if (!created.ok) {
    return created;
  }
  return { ok: true, value: created.value.id };
}

export async function postMessageWithFile(
  token: string,
  channelId: string,
  content: string,
  filePath: string,
): Promise<DiscordResult<DiscordMessage>> {
  const filename = path.basename(filePath);
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content }));
  form.append('files[0]', new Blob([new Uint8Array(bytes)]), filename);
  const result = await discordFetch(token, 'POST', `/channels/${channelId}/messages`, form);
  if (!result.ok) {
    return result;
  }
  const msg = asMessage(result.value);
  if (!msg) {
    return { ok: false, status: 0, message: 'Invalid Discord message response' };
  }
  return { ok: true, value: msg };
}

export function formatMrDiscordBody(opts: {
  webUrl: string;
  title: string;
  draft: boolean;
  color: string;
  authorNick: string;
  authorName?: string;
  reviewers: string[];
  assignees: string[];
}): string {
  const author =
    opts.authorName && opts.authorName !== opts.authorNick
      ? `${opts.authorName} (${opts.authorNick})`
      : opts.authorNick;
  const lines = [
    opts.draft ? DMR_PREFIX : MR_PREFIX,
    opts.webUrl,
    opts.title,
    `color: ${opts.color}`,
    `author: ${author}`,
    `reviewers: ${opts.reviewers.length ? opts.reviewers.join(', ') : '—'}`,
    `assignees: ${opts.assignees.length ? opts.assignees.join(', ') : '—'}`,
  ];
  return lines.join('\n');
}

export function parseMrChip(content: string): {
  webUrl?: string;
  title?: string;
  draft?: boolean;
  color?: string;
} {
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  const head = lines[0] || '';
  if (!head.startsWith(MR_PREFIX) && !head.startsWith(DMR_PREFIX)) {
    return {};
  }
  const webUrl = lines[1]?.startsWith('http') ? lines[1] : undefined;
  const title = lines[2] || undefined;
  const colorLine = lines.find((l) => l.toLowerCase().startsWith('color:'));
  const colorRaw = colorLine ? colorLine.slice(6).trim() : undefined;
  const color = colorRaw && /^#[0-9a-fA-F]{3,8}$/.test(colorRaw) ? colorRaw : undefined;
  const draftLine = lines.find((l) => l.toLowerCase().startsWith('draft:'));
  const draftFromLine = draftLine ? /yes|true|1/i.test(draftLine.slice(6)) : undefined;
  const draft = head.startsWith(DMR_PREFIX) || draftFromLine === true;
  return { webUrl, title, draft, color };
}
