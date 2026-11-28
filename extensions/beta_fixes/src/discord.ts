const API = 'https://discord.com/api/v10';
const PAGE = 10;

export interface Chip {
  id: string;
  text: string;
}

export interface MessagePage {
  chips: Chip[];
  hasMore: boolean;
}

interface TimedChip extends Chip {
  timestamp: string;
}

export async function listMessages(
  token: string,
  channelId: string,
  before?: string,
): Promise<{ ok: true; page: MessagePage } | { ok: false }> {
  const params = new URLSearchParams();
  params.set('limit', String(PAGE));
  if (before) {
    params.set('before', before);
  }
  try {
    const response = await fetch(
      `${API}/channels/${encodeURIComponent(channelId)}/messages?${params.toString()}`,
      {
        headers: { Authorization: `Bot ${token}` },
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) {
      return { ok: false };
    }
    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
      return { ok: false };
    }
    const chips = body
      .map(asChip)
      .filter((chip): chip is TimedChip => chip !== undefined)
      .sort(byTimeThenId)
      .map(({ id, text }) => ({ id, text }));
    return { ok: true, page: { chips, hasMore: body.length === PAGE } };
  } catch {
    return { ok: false };
  }
}

function asChip(value: unknown): TimedChip | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const row = value as { id?: unknown; content?: unknown; timestamp?: unknown };
  if (typeof row.id !== 'string' || row.id.length === 0) {
    return undefined;
  }
  const content = typeof row.content === 'string' ? row.content : '';
  const timestamp = typeof row.timestamp === 'string' ? row.timestamp : '';
  return { id: row.id, text: firstLine(content), timestamp };
}

function firstLine(content: string): string {
  const line = content.split(/\r?\n/, 1)[0]?.trim() ?? '';
  return line.length > 0 ? line : 'пусто';
}

function byTimeThenId(left: TimedChip, right: TimedChip): number {
  if (left.timestamp && right.timestamp && left.timestamp !== right.timestamp) {
    return left.timestamp < right.timestamp ? -1 : 1;
  }
  if (left.id === right.id) {
    return 0;
  }
  return left.id < right.id ? -1 : 1;
}
