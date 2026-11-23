import * as crypto from 'crypto';
import { hitsFromSharedTree, type FigmaTagHit } from './figmaTags';

/**
 * Hover rendering of figma.com frames.
 * Off: the loader below stays in place, but nothing calls the Figma API.
 */
export const figmaLinkPreviewEnabled = false;

/** A figma.com file link, optionally pointing at one frame. */
export interface FigmaFrame {
  /** File key, or the branch key when the URL is a branch. */
  fileKey: string;
  /** Node id with colons, as the Images API expects. */
  nodeId?: string;
}

const FRAME_KINDS = new Set(['file', 'design', 'proto', 'board', 'slides']);
const KEY = /^[0-9A-Za-z]+$/;

/** `design/file/proto/board/slides` link, including a branch URL. */
export function parseFigmaFrame(raw: string): FigmaFrame | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return undefined;
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'figma.com' && !host.endsWith('.figma.com')) {
    return undefined;
  }
  const parts = url.pathname.split('/').filter((part) => part.length > 0);
  const kindAt = parts.findIndex((part) => FRAME_KINDS.has(part.toLowerCase()));
  if (kindAt < 0) {
    return undefined;
  }
  const fileKey = parts[kindAt + 1];
  if (!fileKey || !KEY.test(fileKey)) {
    return undefined;
  }
  let key = fileKey;
  if (parts[kindAt + 2]?.toLowerCase() === 'branch') {
    const branchKey = parts[kindAt + 3];
    if (branchKey && KEY.test(branchKey)) {
      key = branchKey;
    }
  }
  const nodeRaw = url.searchParams.get('node-id')?.split(',')[0]?.trim();
  // Figma URLs write `:` as `-` (`15189:916037` → `15189-916037`). `;` stays.
  const nodeId = nodeRaw ? nodeRaw.replace(/-/g, ':') : undefined;
  return { fileKey: key, nodeId: nodeId || undefined };
}

/** Links stored on a Figma map page. The settings list shows ten and scrolls the rest. */
export const FIGMA_PAGE_FILE_MAX = 20;

/** A file, page, or layer link. `nodeId` uses colons, as the REST API expects. */
export interface FigmaLinkRef {
  fileKey: string;
  nodeId?: string;
  /** Stable design URL. A bare key already saved in settings becomes a file link. */
  url: string;
}

/** One working link. `label` is the name typed in settings, so the node can be recognized. */
export interface FigmaStoredLink {
  url: string;
  label?: string;
}

/** Cap for the typed name above a link. */
export const FIGMA_LINK_LABEL_MAX = 80;

/** `https://www.figma.com/design/{key}` plus `node-id` when the link points at a node. */
export function canonicalFigmaLink(fileKey: string, nodeId?: string): string {
  const base = `https://www.figma.com/design/${fileKey}`;
  if (!nodeId) {
    return base;
  }
  return `${base}?node-id=${nodeId.replace(/:/g, '-')}`;
}

/**
 * A pasted Figma URL, or a bare file key already saved in the page settings.
 * Branch URLs keep the branch key. The stored value is the canonical link, not the key.
 */
export function figmaLinkFromInput(raw: string): FigmaLinkRef | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const frame = parseFigmaFrame(trimmed);
  if (frame) {
    return {
      fileKey: frame.fileKey,
      nodeId: frame.nodeId,
      url: canonicalFigmaLink(frame.fileKey, frame.nodeId),
    };
  }
  if (!KEY.test(trimmed)) {
    return undefined;
  }
  return { fileKey: trimmed, url: canonicalFigmaLink(trimmed) };
}

export type FigmaFileListError = 'invalid' | 'duplicate';

/**
 * A file link covers every page and layer of that file.
 * The same file key and node id cover each other.
 */
export function figmaLinksOverlap(left: FigmaLinkRef, right: FigmaLinkRef): boolean {
  if (left.fileKey !== right.fileKey) {
    return false;
  }
  return !left.nodeId || !right.nodeId || left.nodeId === right.nodeId;
}

function overlappingPair(refs: readonly FigmaLinkRef[]): boolean {
  for (let i = 0; i < refs.length; i += 1) {
    for (let j = i + 1; j < refs.length; j += 1) {
      if (figmaLinksOverlap(refs[i], refs[j])) {
        return true;
      }
    }
  }
  return false;
}

function clipFigmaLabel(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.trim().replace(/\s+/g, ' ').slice(0, FIGMA_LINK_LABEL_MAX);
}

function storedFigmaLink(url: string, label: string): FigmaStoredLink {
  return label ? { url, label } : { url };
}

function parseStoredFigmaItem(item: unknown): { ref: FigmaLinkRef; label: string } | undefined {
  if (typeof item === 'string') {
    const ref = figmaLinkFromInput(item);
    return ref ? { ref, label: '' } : undefined;
  }
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  const url = (item as { url?: unknown }).url;
  if (typeof url !== 'string' || !url.trim()) {
    return undefined;
  }
  const ref = figmaLinkFromInput(url);
  return ref ? { ref, label: clipFigmaLabel((item as { label?: unknown }).label) } : undefined;
}

/** Drop empty rows. A bad row, a repeat, or a link already covered by a wider one rejects the list. */
export function collectFigmaLinks(
  values: readonly unknown[],
): { ok: true; links: FigmaStoredLink[] } | { ok: false; reason: FigmaFileListError } {
  const rows: { ref: FigmaLinkRef; label: string }[] = [];
  let filled = 0;
  for (const value of values) {
    const url =
      typeof value === 'string'
        ? value
        : value && typeof value === 'object'
          ? (value as { url?: unknown }).url
          : undefined;
    if (typeof url !== 'string' || !url.trim()) {
      continue;
    }
    filled += 1;
    if (filled > FIGMA_PAGE_FILE_MAX) {
      return { ok: false, reason: 'invalid' };
    }
    const parsed = parseStoredFigmaItem(value);
    if (!parsed) {
      return { ok: false, reason: 'invalid' };
    }
    rows.push(parsed);
  }
  if (overlappingPair(rows.map((row) => row.ref))) {
    return { ok: false, reason: 'duplicate' };
  }
  return { ok: true, links: rows.map((row) => storedFigmaLink(row.ref.url, row.label)) };
}

/** Stored list: canonical links plus the typed name. A file link drops narrower links of the same file. */
export function normalizeStoredFigmaFiles(raw: unknown): FigmaStoredLink[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const rows: { ref: FigmaLinkRef; label: string }[] = [];
  for (const item of raw) {
    const parsed = parseStoredFigmaItem(item);
    if (!parsed || rows.some((kept) => kept.ref.fileKey === parsed.ref.fileKey && kept.ref.nodeId === parsed.ref.nodeId)) {
      continue;
    }
    rows.push(parsed);
    if (rows.length >= FIGMA_PAGE_FILE_MAX) {
      break;
    }
  }
  const fileKeys = new Set(rows.filter((row) => !row.ref.nodeId).map((row) => row.ref.fileKey));
  const links = rows
    .filter((row) => !row.ref.nodeId || !fileKeys.has(row.ref.fileKey))
    .map((row) => storedFigmaLink(row.ref.url, row.label));
  return links.length > 0 ? links : undefined;
}

/** Cache slot for one URL plus the token that was used. A new token misses. */
export function figmaPreviewCacheKey(url: string, token: string | undefined): string {
  const stamp = token
    ? crypto.createHash('sha256').update(token).digest('hex').slice(0, 12)
    : '';
  return `figma2\n${stamp}\n${url}`;
}

export function normalizeFigmaToken(token: string): string {
  return token.trim().replace(/^Bearer\s+/i, '');
}

/** Bytes the caller stored, or why that URL cannot be the preview. */
export type FigmaImageFile = string | 'too-big' | 'failed';

export interface FigmaPreviewHit {
  image?: string;
  /** Network or render timeout: do not cache, the next hover can try again. */
  retry?: boolean;
  /** Token or file access was rejected. */
  denied?: boolean;
  /** 429. No further Figma calls until Retry-After elapses. */
  limited?: boolean;
  /** Retry-After is many minutes: the monthly image quota, not a short burst. */
  limitQuota?: boolean;
  /** Seconds left on the Figma cooldown. */
  retryAfterSec?: number;
  /** Short API error, safe to show when there is no image. */
  detail?: string;
}

/** Shared by every preview. A 429 must not be followed by another image or file call. */
let limitedUntil = 0;
let limitedQuota = false;

/** True while a 429 cooldown from any Figma call is still running. */
export function figmaRequestPaused(): { retryAfterSec: number } | undefined {
  const hit = rateLimitActive();
  if (!hit?.limited) {
    return undefined;
  }
  return { retryAfterSec: hit.retryAfterSec ?? 60 };
}

function rateLimitActive(): RenderHit | undefined {
  const leftMs = limitedUntil - Date.now();
  if (leftMs <= 0) {
    return undefined;
  }
  return {
    retry: true,
    limited: true,
    limitQuota: limitedQuota,
    retryAfterSec: Math.max(1, Math.ceil(leftMs / 1000)),
  };
}

function blockForRateLimit(response: Response): RenderHit {
  const sec = retryAfterSeconds(response);
  const until = Date.now() + sec * 1000;
  if (until > limitedUntil) {
    limitedUntil = until;
    limitedQuota = sec >= 10 * 60;
  }
  return {
    retry: true,
    limited: true,
    limitQuota: limitedQuota,
    retryAfterSec: sec,
  };
}

function retryAfterSeconds(response: Response): number {
  const raw = Number(response.headers.get('Retry-After'));
  const sec = Number.isFinite(raw) && raw > 0 ? raw : 60;
  return Math.min(sec, 60 * 60 * 24 * 45);
}

/**
 * Preview bytes for a frame. A large board is requested at scale 0.5, then
 * once smaller. A 429 pauses every later Figma call until Retry-After.
 */
export async function loadFigmaPreview(
  frame: FigmaFrame,
  token: string,
  download: (imageUrl: string) => Promise<FigmaImageFile>,
): Promise<FigmaPreviewHit> {
  const clean = normalizeFigmaToken(token);
  if (!clean) {
    return { denied: true };
  }
  let detail: string | undefined;
  const take = async (hit: RenderHit): Promise<FigmaPreviewHit | 'too-big' | 'shrink' | 'miss'> => {
    if (hit.detail) {
      detail = hit.detail;
    }
    if (hit.retry) {
      return {
        retry: true,
        limited: hit.limited,
        limitQuota: hit.limitQuota,
        retryAfterSec: hit.retryAfterSec,
        detail: hit.limited ? undefined : hit.detail,
      };
    }
    if (hit.denied) {
      return { denied: true, detail: hit.detail };
    }
    if (hit.shrink && !hit.imageUrl) {
      return 'shrink';
    }
    if (!hit.imageUrl) {
      return 'miss';
    }
    const file = await download(hit.imageUrl);
    if (typeof file === 'string') {
      return { image: file };
    }
    if (file === 'failed') {
      return 'shrink';
    }
    return 'too-big';
  };

  if (!frame.nodeId) {
    const thumb = await take(await fileThumbnail(frame.fileKey, clean));
    if (typeof thumb !== 'string') {
      return thumb;
    }
    return { detail };
  }

  // At most two Tier-1 image renders. GET /v1/files is the same scarce quota,
  // so a file thumbnail is not used as a third try.
  const first = await take(await renderFrame(frame, clean, 0.5, false));
  if (typeof first !== 'string') {
    return first;
  }
  if (first === 'shrink' || first === 'too-big') {
    const second = await take(await renderFrame(frame, clean, 0.15, false));
    if (typeof second !== 'string') {
      return second;
    }
    return { retry: true, detail };
  }

  const absolute = await take(await renderFrame(frame, clean, 0.5, true));
  if (typeof absolute !== 'string') {
    return absolute;
  }
  return { detail };
}

interface RenderHit {
  imageUrl?: string;
  retry?: boolean;
  denied?: boolean;
  shrink?: boolean;
  limited?: boolean;
  limitQuota?: boolean;
  retryAfterSec?: number;
  detail?: string;
}

async function renderFrame(
  frame: FigmaFrame,
  token: string,
  scale: number,
  absoluteBounds: boolean,
): Promise<RenderHit> {
  const blocked = rateLimitActive();
  if (blocked) {
    return blocked;
  }
  const params = new URLSearchParams({
    ids: frame.nodeId || '',
    format: 'jpg',
    scale: String(scale),
  });
  if (absoluteBounds) {
    params.set('use_absolute_bounds', 'true');
  }
  const endpoint = `https://api.figma.com/v1/images/${encodeURIComponent(frame.fileKey)}?${params}`;
  return figmaGet(endpoint, token, 35_000, (body) => imageUrlFrom(body, frame.nodeId || ''));
}

async function fileThumbnail(fileKey: string, token: string): Promise<RenderHit> {
  const blocked = rateLimitActive();
  if (blocked) {
    return blocked;
  }
  const endpoint = `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}?depth=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: figmaHeaders(token),
    });
    if (response.status === 429) {
      return blockForRateLimit(response);
    }
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return { denied: true, detail: await readErrText(response) };
    }
    if (response.status >= 500) {
      return { shrink: true };
    }
    if (!response.ok) {
      const detail = await readErrText(response);
      return isShrinkErr(detail, response.status) ? { shrink: true, detail } : { detail };
    }
    const text = await readTextLimited(response, 65_536);
    const match = /"thumbnailUrl"\s*:\s*"([^"]+)"/.exec(text);
    if (!match?.[1]) {
      return {};
    }
    return { imageUrl: decodeJsonString(match[1]) };
  } catch {
    return { shrink: true };
  } finally {
    clearTimeout(timer);
  }
}

async function figmaGet(
  endpoint: string,
  token: string,
  timeoutMs: number,
  imageOf: (body: unknown) => string | undefined,
): Promise<RenderHit> {
  const blocked = rateLimitActive();
  if (blocked) {
    return blocked;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: figmaHeaders(token),
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const detail = clipErr(errFrom(body));
    if (response.status === 429) {
      return blockForRateLimit(response);
    }
    if (isDenied(response.status, detail)) {
      return { denied: true, detail };
    }
    const imageUrl = response.ok ? imageOf(body) : undefined;
    if (imageUrl) {
      return { imageUrl };
    }
    if (isShrinkErr(detail, response.status)) {
      return { shrink: true, detail };
    }
    return { detail };
  } catch {
    return { shrink: true };
  } finally {
    clearTimeout(timer);
  }
}

export type FigmaSharedHits =
  | { ok: true; hits: FigmaTagHit[] }
  | { ok: false; limited?: boolean; denied?: boolean };

/**
 * File JSON with shared plugin data. No `depth`: a shallow file drops nested tags.
 * A 429 starts the same cooldown as image previews and does not wait to retry.
 */
export async function loadFigmaSharedHits(
  fileUrl: string,
  fileKey: string,
  nodeId: string | undefined,
  token: string,
): Promise<FigmaSharedHits> {
  const clean = normalizeFigmaToken(token);
  if (!clean) {
    return { ok: false, denied: true };
  }
  if (figmaRequestPaused()) {
    return { ok: false, limited: true };
  }
  const params = new URLSearchParams({ plugin_data: 'shared' });
  if (nodeId) {
    params.set('ids', nodeId);
  }
  const endpoint = `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}?${params}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: figmaHeaders(clean),
    });
    if (response.status === 429) {
      blockForRateLimit(response);
      return { ok: false, limited: true };
    }
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return { ok: false, denied: true };
    }
    if (!response.ok) {
      return { ok: false };
    }
    const body = (await response.json()) as unknown;
    return {
      ok: true,
      hits: hitsFromSharedTree(fileUrl, (id) => canonicalFigmaLink(fileKey, id), body),
    };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

function figmaHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'X-Figma-Token': token,
  };
}

function imageUrlFrom(body: unknown, nodeId: string): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const images = (body as { images?: unknown }).images;
  if (!images || typeof images !== 'object') {
    return undefined;
  }
  const map = images as Record<string, unknown>;
  const direct = map[nodeId];
  if (typeof direct === 'string' && direct) {
    return direct;
  }
  for (const value of Object.values(map)) {
    if (typeof value === 'string' && value) {
      return value;
    }
  }
  return undefined;
}

function errFrom(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const err = (body as { err?: unknown; message?: unknown }).err;
  if (typeof err === 'string' && err.trim()) {
    return err.trim();
  }
  const message = (body as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message.trim() : undefined;
}

function isDenied(status: number, err: string | undefined): boolean {
  if (status === 401 || status === 403 || status === 404) {
    return true;
  }
  return !!err && /token|scope|permission|forbidden/i.test(err);
}

function isShrinkErr(err: string | undefined, status: number): boolean {
  if (status >= 500) {
    return true;
  }
  return !!err && /timeout|too large|smaller|render/i.test(err);
}

function clipErr(err: string | undefined): string | undefined {
  if (!err) {
    return undefined;
  }
  return err.length > 160 ? `${err.slice(0, 160)}…` : err;
}

function decodeJsonString(value: string): string {
  try {
    const parsed = JSON.parse(`"${value}"`) as unknown;
    return typeof parsed === 'string' ? parsed : value;
  } catch {
    return value.replace(/\\\//g, '/');
  }
}

async function readErrText(response: Response): Promise<string | undefined> {
  try {
    return clipErr(errFrom(JSON.parse(await readTextLimited(response, 4_096)) as unknown));
  } catch {
    return undefined;
  }
}

async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.subarray(0, maxBytes).toString('utf8');
  }
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) {
        break;
      }
      const chunk = Buffer.from(value);
      chunks.push(chunk);
      total += chunk.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8');
}
