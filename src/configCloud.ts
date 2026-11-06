import {
  type CloudStamp,
  type ConfigMessageKind,
  type ParsedConfigHeader,
  formatConfigHeader,
  isCloudNewer,
  parseConfigHeader,
} from './configFormat';
import {
  type DiscordMessage,
  type DiscordResult,
  fetchAttachmentText,
  listChannelMessages,
  postMessageWithAttachment,
} from './discordApi';

export interface LatestConfigMessage {
  message: DiscordMessage;
  header: ParsedConfigHeader;
  attachmentUrl: string;
  attachmentFilename: string;
}

/** How many 100-message pages to walk when several page configs share a channel. */
const CHANNEL_SCAN_PAGES = 20;

function configMessageOf(
  message: DiscordMessage,
  kind: ConfigMessageKind,
  pageId: string | undefined,
): LatestConfigMessage | undefined {
  const header = parseConfigHeader(message.content);
  if (!header || header.kind !== kind) {
    return undefined;
  }
  if (kind === 'BASE') {
    if (header.pageId) {
      return undefined;
    }
  } else if (!header.pageId || header.pageId !== pageId) {
    return undefined;
  }
  const attachment = message.attachments?.[0];
  if (!attachment?.url) {
    return undefined;
  }
  return {
    message,
    header,
    attachmentUrl: attachment.url,
    attachmentFilename: attachment.filename || 'config.json',
  };
}

/**
 * Newest matching config message.
 * Other pages of the same kind in this channel are skipped, walking older history
 * until this pageId is found.
 */
export async function findLatestConfigMessage(
  token: string,
  channelId: string,
  kind: ConfigMessageKind,
  pageId: string | undefined,
): Promise<DiscordResult<LatestConfigMessage | undefined>> {
  let before: string | undefined;
  for (let page = 0; page < CHANNEL_SCAN_PAGES; page += 1) {
    const listed = await listChannelMessages(token, channelId, { limit: 100, before });
    if (!listed.ok) {
      return listed;
    }
    for (const message of [...listed.value].reverse()) {
      const found = configMessageOf(message, kind, kind === 'BASE' ? undefined : pageId);
      if (found) {
        return { ok: true, value: found };
      }
    }
    if (listed.value.length < 100) {
      return { ok: true, value: undefined };
    }
    before = listed.value[0]?.id;
    if (!before) {
      return { ok: true, value: undefined };
    }
  }
  return { ok: true, value: undefined };
}

/**
 * Newest config message of `kind` for every page id seen.
 * `needPageIds` are local pages in this channel: history is walked until each of
 * them has its own latest message, so a neighbour's config cannot stand in for them.
 * The newest batch is always read, so a just-pushed page is still discovered.
 */
export async function findLatestPageMessages(
  token: string,
  channelId: string,
  kind: ConfigMessageKind,
  needPageIds: readonly string[] = [],
): Promise<DiscordResult<LatestConfigMessage[]>> {
  if (kind === 'BASE') {
    return { ok: true, value: [] };
  }
  const byPage = new Map<string, LatestConfigMessage>();
  const pending = new Set(needPageIds);
  let before: string | undefined;
  for (let page = 0; page < CHANNEL_SCAN_PAGES; page += 1) {
    const listed = await listChannelMessages(token, channelId, { limit: 100, before });
    if (!listed.ok) {
      return listed;
    }
    for (const message of [...listed.value].reverse()) {
      const header = parseConfigHeader(message.content);
      if (!header || header.kind !== kind || !header.pageId || byPage.has(header.pageId)) {
        continue;
      }
      const attachment = message.attachments?.[0];
      if (!attachment?.url) {
        continue;
      }
      byPage.set(header.pageId, {
        message,
        header,
        attachmentUrl: attachment.url,
        attachmentFilename: attachment.filename || 'config.json',
      });
      pending.delete(header.pageId);
    }
    if (listed.value.length < 100 || pending.size === 0) {
      break;
    }
    before = listed.value[0]?.id;
    if (!before) {
      break;
    }
  }
  return { ok: true, value: [...byPage.values()] };
}

export async function downloadConfigAttachment(
  token: string,
  url: string,
): Promise<DiscordResult<string>> {
  return fetchAttachmentText(token, url);
}

export async function postConfigMessage(opts: {
  token: string;
  channelId: string;
  kind: ConfigMessageKind;
  pageId?: string;
  number: number;
  headerDate?: string;
  filename: string;
  body: string;
}): Promise<DiscordResult<DiscordMessage>> {
  const content = formatConfigHeader({
    kind: opts.kind,
    pageId: opts.pageId,
    number: opts.number,
    headerDate: opts.headerDate,
  });
  return postMessageWithAttachment(
    opts.token,
    opts.channelId,
    content,
    opts.filename,
    Buffer.from(opts.body, 'utf8'),
  );
}

export function stampFromLatest(latest: LatestConfigMessage): CloudStamp {
  return {
    number: latest.header.number,
    headerDate: latest.header.headerDate,
    messageId: latest.message.id,
  };
}

export function latestIsNewer(latest: LatestConfigMessage, current: CloudStamp | undefined): boolean {
  return isCloudNewer(
    {
      headerDate: latest.header.headerDate,
      messageId: latest.message.id,
      number: latest.header.number,
    },
    current,
  );
}

export function nextConfigNumber(stamp: CloudStamp | undefined): number {
  return (stamp?.number ?? 0) + 1;
}
