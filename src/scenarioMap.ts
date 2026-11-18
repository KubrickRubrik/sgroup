import * as path from 'path';
import * as vscode from 'vscode';
import { getSecret, SECRET_DISCORD } from './accessStore';
import {
  countScenarioSteeps,
  deleteChannelMessage,
  DiscordMessage,
  editChannelMessage,
  editMessageWithAttachment,
  ensureThread,
  fetchAttachmentText,
  formatScenarioDiscordBody,
  formatScenarioGroupDiscordBody,
  isConfigMessage,
  isDiscordSystemNotice,
  isScenarioGroupMessage,
  isScenarioMessage,
  listChannelMessages,
  listThreadMessages,
  parseScenarioChip,
  parseScenarioGroupChip,
  postChannelMessage,
  postMessageWithAttachment,
  SCENARIO_DEFAULT_TITLE,
  SCENARIO_GROUP_DEFAULT_TITLE,
  SCENARIO_GROUP_MAX,
  ScenarioGroupStatus,
  sortMessagesAsc,
  THREAD_STARTER_MESSAGE,
} from './discordApi';
import { randomLinkPaletteColor } from './linkPalette';
import { MarkerStore } from './markerStore';
import { normalizeHex } from './palette';
import { runScenarioAsk } from './reviewAgent';

export interface ScenarioChildChip {
  id: string;
  title: string;
  date?: string;
  steep: number;
  order: number;
  hasFile: boolean;
  filename?: string;
  /** Markdown body when the attachment was fetched. */
  md?: string;
  contentMissing?: boolean;
  timestamp: string;
}

export interface ScenarioChip {
  id: string;
  isGroup: boolean;
  title: string;
  date?: string;
  steep?: number;
  order?: number;
  counter?: number;
  status?: ScenarioGroupStatus;
  alias?: string;
  description?: string;
  color?: string;
  hasFile: boolean;
  filename?: string;
  md?: string;
  locked: boolean;
  threadId?: string;
  hasThread?: boolean;
  children: ScenarioChildChip[];
  childrenLoaded?: boolean;
  contentMissing?: boolean;
  timestamp: string;
}

export interface ScenarioPageState {
  pageId: string;
  loading: boolean;
  error?: string;
  empty?: boolean;
  contentBlocked?: boolean;
  messages: ScenarioChip[];
}

type ScenarioWindow = {
  messages: DiscordMessage[];
  /** Thread id → scenario replies in that group. */
  threads: Map<string, DiscordMessage[]>;
  /** messageId → fetched md text. */
  mdById: Map<string, string>;
};

function parseScenarioQuestions(text: string): ScenarioFormQuestion[] | undefined {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }
  const raw = (parsed as { questions?: unknown }).questions;
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 3) {
    return undefined;
  }
  const seen = new Set<string>();
  const questions: ScenarioFormQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return undefined;
    }
    const id = typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id.trim() : '';
    const prompt =
      typeof (item as { prompt?: unknown }).prompt === 'string'
        ? (item as { prompt: string }).prompt.trim()
        : '';
    const optionsRaw = (item as { options?: unknown }).options;
    if (!id || !prompt || seen.has(id) || !Array.isArray(optionsRaw) || optionsRaw.length < 2) {
      return undefined;
    }
    seen.add(id);
    const optionIds = new Set<string>();
    const options: ScenarioFormOption[] = [];
    for (const option of optionsRaw) {
      if (!option || typeof option !== 'object') {
        return undefined;
      }
      const optionId =
        typeof (option as { id?: unknown }).id === 'string' ? (option as { id: string }).id.trim() : '';
      const label =
        typeof (option as { label?: unknown }).label === 'string'
          ? (option as { label: string }).label.trim()
          : '';
      if (!optionId || !label || optionIds.has(optionId)) {
        return undefined;
      }
      optionIds.add(optionId);
      options.push({ id: optionId, label });
    }
    questions.push({ id, prompt, options });
  }
  return questions;
}

/** Markdown from the first heading line. Empty when that slice has no sequence diagram. */
function scenarioDiagramFromAnswer(text: string): string | undefined {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const idx = lines.findIndex((line) => line.trimStart().startsWith('#'));
  if (idx < 0) {
    return undefined;
  }
  const md = lines.slice(idx).join('\n').trim();
  if (!/```\s*mermaid[\s\S]*?sequenceDiagram/i.test(md)) {
    return undefined;
  }
  return md;
}

function isNoise(msg: DiscordMessage): boolean {
  return isDiscordSystemNotice(msg) || isConfigMessage(msg.content);
}

function isThreadStarter(msg: DiscordMessage): boolean {
  return msg.type === THREAD_STARTER_MESSAGE;
}

export interface ScenarioFormOption {
  id: string;
  label: string;
}

export interface ScenarioFormQuestion {
  id: string;
  prompt: string;
  options: ScenarioFormOption[];
}

type ScenarioFormPhase = 'questions' | 'ready' | 'diagram';

type ScenarioFormSession = {
  pageId: string;
  messageId: string;
  phase: ScenarioFormPhase;
  questions?: ScenarioFormQuestion[];
};

function mdAttachment(msg: DiscordMessage): { filename: string; url: string } | undefined {
  const files = msg.attachments ?? [];
  return files.find((file) => /\.(md|markdown)$/i.test(file.filename)) ?? files[0];
}

function toChild(msg: DiscordMessage, md?: string): ScenarioChildChip | undefined {
  if (!isScenarioMessage(msg.content)) {
    return undefined;
  }
  const parsed = parseScenarioChip(msg.content);
  const file = mdAttachment(msg);
  return {
    id: msg.id,
    title: (parsed.title || SCENARIO_DEFAULT_TITLE).trim() || SCENARIO_DEFAULT_TITLE,
    date: parsed.date,
    steep: parsed.steep ?? 0,
    order: parsed.order ?? 0,
    hasFile: !!file,
    filename: file?.filename,
    md,
    contentMissing: msg.contentMissing,
    timestamp: msg.timestamp,
  };
}

function toChip(
  msg: DiscordMessage,
  children: ScenarioChildChip[] = [],
  childrenLoaded = false,
  md?: string,
): ScenarioChip {
  if (isScenarioGroupMessage(msg.content)) {
    const parsed = parseScenarioGroupChip(msg.content);
    const locked = parsed.status === 'lock';
    return {
      id: msg.id,
      isGroup: true,
      title: (parsed.title || SCENARIO_GROUP_DEFAULT_TITLE).trim() || SCENARIO_GROUP_DEFAULT_TITLE,
      date: parsed.date,
      counter: parsed.counter ?? children.length,
      status: parsed.status ?? 'open',
      alias: parsed.alias,
      description: parsed.description,
      color: parsed.color,
      hasFile: false,
      locked,
      threadId: msg.thread?.id,
      hasThread: !!msg.thread?.id || !!msg.hasThread,
      children: children.slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
      childrenLoaded,
      contentMissing: msg.contentMissing,
      timestamp: msg.timestamp,
    };
  }
  const parsed = parseScenarioChip(msg.content);
  const file = mdAttachment(msg);
  return {
    id: msg.id,
    isGroup: false,
    title: (parsed.title || SCENARIO_DEFAULT_TITLE).trim() || SCENARIO_DEFAULT_TITLE,
    date: parsed.date,
    steep: parsed.steep ?? 0,
    order: parsed.order,
    hasFile: !!file,
    filename: file?.filename,
    md,
    locked: false,
    children: [],
    contentMissing: msg.contentMissing,
    timestamp: msg.timestamp,
  };
}

export class ScenarioMapController {
  private channelId = '';
  private readonly windows = new Map<string, ScenarioWindow>();
  private formSession: ScenarioFormSession | null = null;
  private onChange?: (pageId: string, state: ScenarioPageState) => void;

  constructor(
    private readonly store: MarkerStore,
    private readonly hostSecrets: vscode.SecretStorage,
    private readonly cwd: () => string,
  ) {}

  setChangeHandler(handler: (pageId: string, state: ScenarioPageState) => void): void {
    this.onChange = handler;
  }

  bindChannel(channelId: string): void {
    this.channelId = channelId.trim();
  }

  channel(): string {
    return this.channelId || (this.store.catalogChannels().scenarios || '').trim();
  }

  snapshot(pageId: string): ScenarioPageState {
    const win = this.windows.get(pageId);
    if (!win) {
      return { pageId, loading: false, empty: true, messages: [] };
    }
    const messages = sortMessagesAsc(win.messages)
      .filter((msg) => !isNoise(msg) && (isScenarioGroupMessage(msg.content) || isScenarioMessage(msg.content)))
      .map((msg) => {
        const threadId = msg.thread?.id;
        const children =
          threadId && isScenarioGroupMessage(msg.content)
            ? (win.threads.get(threadId) || [])
                .map((reply) => toChild(reply, win.mdById.get(reply.id)))
                .filter((item): item is ScenarioChildChip => !!item)
            : [];
        return toChip(
          msg,
          children,
          threadId ? win.threads.has(threadId) : false,
          win.mdById.get(msg.id),
        );
      });
    const missingCount = messages.filter((m) => m.contentMissing).length;
    return {
      pageId,
      loading: false,
      empty: messages.length === 0,
      contentBlocked: messages.length > 0 && missingCount === messages.length,
      messages,
    };
  }

  private emit(pageId: string): void {
    this.onChange?.(pageId, this.snapshot(pageId));
  }

  private async discordToken(): Promise<string> {
    return (await getSecret(this.hostSecrets, SECRET_DISCORD)) || '';
  }

  async loadInitial(pageId: string): Promise<ScenarioPageState> {
    const channelId = this.channel();
    const token = await this.discordToken();
    if (!channelId) {
      return { pageId, loading: false, error: 'Discord channel is not set', messages: [] };
    }
    if (!token) {
      return { pageId, loading: false, error: 'Discord bot token is missing', messages: [] };
    }
    this.emitLoading(pageId);
    try {
      const collected: DiscordMessage[] = [];
      let before: string | undefined;
      for (let page = 0; page < 20; page += 1) {
        const listed = await listChannelMessages(token, channelId, { limit: 100, before });
        if (!listed.ok) {
          return { pageId, loading: false, error: listed.message, messages: [] };
        }
        if (listed.value.length === 0) {
          break;
        }
        collected.push(...listed.value);
        before = listed.value[listed.value.length - 1]?.id;
        if (listed.value.length < 100) {
          break;
        }
      }
      const messages = sortMessagesAsc(collected).filter(
        (msg) => !isNoise(msg) && (isScenarioGroupMessage(msg.content) || isScenarioMessage(msg.content)),
      );
      const win: ScenarioWindow = {
        messages,
        threads: new Map(),
        mdById: new Map(),
      };
      this.windows.set(pageId, win);
      for (const msg of messages) {
        if (isScenarioGroupMessage(msg.content) && (msg.thread?.id || msg.hasThread)) {
          await this.loadGroupThread(pageId, msg.id);
        }
        if (isScenarioMessage(msg.content)) {
          await this.fetchMd(pageId, msg);
        }
      }
      return this.snapshot(pageId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { pageId, loading: false, error: message || 'Scenario load failed', messages: [] };
    }
  }

  private emitLoading(pageId: string): void {
    this.onChange?.(pageId, { pageId, loading: true, messages: this.snapshot(pageId).messages });
  }

  async loadGroupThread(pageId: string, groupId: string): Promise<ScenarioPageState> {
    const win = this.windows.get(pageId);
    const token = await this.discordToken();
    const channelId = this.channel();
    const parent = win?.messages.find((msg) => msg.id === groupId);
    if (!win || !token || !channelId || !parent) {
      return this.snapshot(pageId);
    }
    const thread = await ensureThread(
      token,
      channelId,
      parent,
      parseScenarioGroupChip(parent.content).title || 'scenarios',
    );
    if (!thread.ok) {
      return { ...this.snapshot(pageId), error: thread.message };
    }
    parent.thread = thread.value;
    parent.hasThread = true;
    const collected: DiscordMessage[] = [];
    let before: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const listed = await listThreadMessages(token, thread.value.id, { limit: 100, before });
      if (!listed.ok) {
        return { ...this.snapshot(pageId), error: listed.message };
      }
      if (listed.value.length === 0) {
        break;
      }
      collected.push(...listed.value);
      before = listed.value[listed.value.length - 1]?.id;
      if (listed.value.length < 100) {
        break;
      }
    }
    const replies = sortMessagesAsc(collected).filter(
      (msg) => !isThreadStarter(msg) && !isNoise(msg) && isScenarioMessage(msg.content),
    );
    win.threads.set(thread.value.id, replies);
    for (const reply of replies) {
      await this.fetchMd(pageId, reply);
    }
    await this.syncGroupCounter(pageId, groupId);
    return this.snapshot(pageId);
  }

  private async fetchMd(pageId: string, msg: DiscordMessage): Promise<void> {
    const win = this.windows.get(pageId);
    const token = await this.discordToken();
    const file = mdAttachment(msg);
    if (!win || !token || !file) {
      return;
    }
    const downloaded = await fetchAttachmentText(token, file.url);
    if (downloaded.ok) {
      win.mdById.set(msg.id, downloaded.value);
    }
  }

  private async syncGroupCounter(pageId: string, groupId: string): Promise<void> {
    const win = this.windows.get(pageId);
    const token = await this.discordToken();
    const channelId = this.channel();
    const parent = win?.messages.find((msg) => msg.id === groupId);
    if (!win || !token || !channelId || !parent || !parent.thread?.id) {
      return;
    }
    const children = (win.threads.get(parent.thread.id) || []).filter((msg) =>
      isScenarioMessage(msg.content),
    );
    const current = parseScenarioGroupChip(parent.content).counter ?? -1;
    if (current === children.length) {
      return;
    }
    const next = formatScenarioGroupDiscordBody({
      ...parseScenarioGroupChip(parent.content),
      title: parseScenarioGroupChip(parent.content).title || SCENARIO_GROUP_DEFAULT_TITLE,
      color: parseScenarioGroupChip(parent.content).color || randomLinkPaletteColor(),
      counter: children.length,
    });
    const edited = await editChannelMessage(token, channelId, parent.id, next);
    if (edited.ok) {
      const idx = win.messages.findIndex((msg) => msg.id === parent.id);
      if (idx >= 0) {
        win.messages[idx] = {
          ...edited.value,
          thread: edited.value.thread ?? parent.thread,
          hasThread: true,
        };
      }
    }
  }

  async createGroup(pageId: string): Promise<{ kind: 'state'; state: ScenarioPageState } | { kind: 'error'; message: string }> {
    const token = await this.discordToken();
    const channelId = this.channel();
    if (!token || !channelId) {
      return { kind: 'error', message: 'Discord channel or token is missing' };
    }
    const body = formatScenarioGroupDiscordBody({
      title: SCENARIO_GROUP_DEFAULT_TITLE,
      color: randomLinkPaletteColor(),
      counter: 0,
      status: 'open',
    });
    const posted = await postChannelMessage(token, channelId, body);
    if (!posted.ok) {
      return { kind: 'error', message: posted.message };
    }
    const win: ScenarioWindow =
      this.windows.get(pageId) || { messages: [], threads: new Map(), mdById: new Map() };
    win.messages.push(posted.value);
    this.windows.set(pageId, win);
    const thread = await ensureThread(token, channelId, posted.value, SCENARIO_GROUP_DEFAULT_TITLE);
    if (thread.ok) {
      posted.value.thread = thread.value;
      posted.value.hasThread = true;
      win.threads.set(thread.value.id, []);
    }
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  async createScenario(
    pageId: string,
    groupId?: string,
  ): Promise<{ kind: 'state'; state: ScenarioPageState } | { kind: 'error'; message: string }> {
    const token = await this.discordToken();
    const channelId = this.channel();
    if (!token || !channelId) {
      return { kind: 'error', message: 'Discord channel or token is missing' };
    }
    const win: ScenarioWindow =
      this.windows.get(pageId) || { messages: [], threads: new Map(), mdById: new Map() };
    this.windows.set(pageId, win);
    if (!groupId) {
      const body = formatScenarioDiscordBody({ title: SCENARIO_DEFAULT_TITLE, steep: 0 });
      const posted = await postChannelMessage(token, channelId, body);
      if (!posted.ok) {
        return { kind: 'error', message: posted.message };
      }
      win.messages.push(posted.value);
      return { kind: 'state', state: this.snapshot(pageId) };
    }
    const parent = win.messages.find((msg) => msg.id === groupId);
    if (!parent || !isScenarioGroupMessage(parent.content)) {
      return { kind: 'error', message: 'Group not found' };
    }
    if (parseScenarioGroupChip(parent.content).status === 'lock') {
      return { kind: 'error', message: 'Group is locked' };
    }
    const thread = await ensureThread(
      token,
      channelId,
      parent,
      parseScenarioGroupChip(parent.content).title || SCENARIO_GROUP_DEFAULT_TITLE,
    );
    if (!thread.ok) {
      return { kind: 'error', message: thread.message };
    }
    parent.thread = thread.value;
    parent.hasThread = true;
    const existing: DiscordMessage[] = win.threads.get(thread.value.id) || [];
    if (existing.filter((msg: DiscordMessage) => isScenarioMessage(msg.content)).length >= SCENARIO_GROUP_MAX) {
      return { kind: 'error', message: `This group already has ${SCENARIO_GROUP_MAX} scenarios` };
    }
    const nextOrder =
      existing.reduce(
        (max: number, msg: DiscordMessage) => Math.max(max, parseScenarioChip(msg.content).order || 0),
        0,
      ) + 1;
    const body = formatScenarioDiscordBody({
      title: SCENARIO_DEFAULT_TITLE,
      steep: 0,
      order: nextOrder,
    });
    const posted = await postChannelMessage(token, thread.value.id, body);
    if (!posted.ok) {
      return { kind: 'error', message: posted.message };
    }
    existing.push(posted.value);
    win.threads.set(thread.value.id, existing);
    await this.syncGroupCounter(pageId, groupId);
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  async renameScenario(
    pageId: string,
    messageId: string,
    title: string,
  ): Promise<{ kind: 'state'; state: ScenarioPageState } | { kind: 'error'; message: string }> {
    const found = this.findMessage(pageId, messageId);
    if (!found) {
      return { kind: 'error', message: 'Message not found' };
    }
    if (found.groupLocked) {
      return { kind: 'error', message: 'Group is locked' };
    }
    const token = await this.discordToken();
    if (!token) {
      return { kind: 'error', message: 'Discord bot token is missing' };
    }
    const parsed = parseScenarioChip(found.msg.content);
    const body = formatScenarioDiscordBody({
      title: title.trim() || SCENARIO_DEFAULT_TITLE,
      date: parsed.date,
      steep: parsed.steep ?? 0,
      order: parsed.order,
    });
    const edited = await editChannelMessage(token, found.channelOrThreadId, messageId, body);
    if (!edited.ok) {
      return { kind: 'error', message: edited.message };
    }
    this.replaceMessage(pageId, found, edited.value);
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  async updateGroup(
    pageId: string,
    groupId: string,
    partial: {
      title?: string;
      alias?: string;
      description?: string;
      color?: string | null;
      status?: ScenarioGroupStatus;
    },
  ): Promise<{ kind: 'state'; state: ScenarioPageState } | { kind: 'error'; message: string }> {
    const win = this.windows.get(pageId);
    const token = await this.discordToken();
    const channelId = this.channel();
    const parent = win?.messages.find((msg) => msg.id === groupId);
    if (!win || !token || !channelId || !parent) {
      return { kind: 'error', message: 'Group not found' };
    }
    const current = parseScenarioGroupChip(parent.content);
    if (current.status === 'lock' && partial.status !== 'open') {
      return { kind: 'error', message: 'Group is locked' };
    }
    const color =
      partial.color === null
        ? ''
        : partial.color !== undefined
          ? normalizeHex(partial.color) || current.color || randomLinkPaletteColor()
          : current.color || randomLinkPaletteColor();
    const body = formatScenarioGroupDiscordBody({
      title: partial.title !== undefined ? partial.title : current.title || SCENARIO_GROUP_DEFAULT_TITLE,
      alias: partial.alias !== undefined ? partial.alias : current.alias,
      description: partial.description !== undefined ? partial.description : current.description,
      color: color || randomLinkPaletteColor(),
      date: current.date,
      counter: current.counter ?? 0,
      status: partial.status ?? current.status ?? 'open',
    });
    const edited = await editChannelMessage(token, channelId, groupId, body);
    if (!edited.ok) {
      return { kind: 'error', message: edited.message };
    }
    const idx = win.messages.findIndex((msg) => msg.id === groupId);
    if (idx >= 0) {
      win.messages[idx] = {
        ...edited.value,
        thread: edited.value.thread ?? parent.thread,
        hasThread: parent.hasThread,
      };
    }
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  async deleteMessage(
    pageId: string,
    messageId: string,
  ): Promise<{ kind: 'state'; state: ScenarioPageState } | { kind: 'error'; message: string }> {
    const found = this.findMessage(pageId, messageId);
    if (!found) {
      return { kind: 'error', message: 'Message not found' };
    }
    if (found.groupLocked && !found.isGroup) {
      return { kind: 'error', message: 'Group is locked' };
    }
    if (found.isGroup && parseScenarioGroupChip(found.msg.content).status === 'lock') {
      return { kind: 'error', message: 'Group is locked' };
    }
    const token = await this.discordToken();
    if (!token) {
      return { kind: 'error', message: 'Discord bot token is missing' };
    }
    const deleted = await deleteChannelMessage(token, found.channelOrThreadId, messageId);
    if (!deleted.ok) {
      return { kind: 'error', message: deleted.message };
    }
    const win = this.windows.get(pageId);
    if (!win) {
      return { kind: 'state', state: this.snapshot(pageId) };
    }
    if (found.isGroup) {
      if (found.msg.thread?.id) {
        win.threads.delete(found.msg.thread.id);
      }
      win.messages = win.messages.filter((msg) => msg.id !== messageId);
    } else if (found.groupId) {
      const bucket = win.threads.get(found.channelOrThreadId);
      if (bucket) {
        win.threads.set(
          found.channelOrThreadId,
          bucket.filter((msg) => msg.id !== messageId),
        );
      }
      await this.syncGroupCounter(pageId, found.groupId);
    } else {
      win.messages = win.messages.filter((msg) => msg.id !== messageId);
    }
    win.mdById.delete(messageId);
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  async reorderInGroup(
    pageId: string,
    groupId: string,
    orderedIds: string[],
  ): Promise<{ kind: 'state'; state: ScenarioPageState } | { kind: 'error'; message: string }> {
    const win = this.windows.get(pageId);
    const token = await this.discordToken();
    const parent = win?.messages.find((msg) => msg.id === groupId);
    if (!win || !token || !parent?.thread?.id) {
      return { kind: 'error', message: 'Group not found' };
    }
    if (parseScenarioGroupChip(parent.content).status === 'lock') {
      return { kind: 'error', message: 'Group is locked' };
    }
    const bucket = win.threads.get(parent.thread.id) || [];
    const byId = new Map(bucket.map((msg) => [msg.id, msg]));
    let order = 1;
    for (const id of orderedIds) {
      const msg = byId.get(id);
      if (!msg) {
        continue;
      }
      const parsed = parseScenarioChip(msg.content);
      if (parsed.order === order) {
        order += 1;
        continue;
      }
      const body = formatScenarioDiscordBody({
        title: parsed.title || SCENARIO_DEFAULT_TITLE,
        date: parsed.date,
        steep: parsed.steep ?? 0,
        order,
      });
      const edited = await editChannelMessage(token, parent.thread.id, id, body);
      if (edited.ok) {
        const idx = bucket.findIndex((item) => item.id === id);
        if (idx >= 0) {
          bucket[idx] = { ...edited.value, attachments: edited.value.attachments?.length ? edited.value.attachments : msg.attachments };
        }
      }
      order += 1;
    }
    win.threads.set(parent.thread.id, bucket);
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  /**
   * Copy or move a scenario into another group (end) or to the channel root (end).
   * Move = post copy, then delete source.
   */
  async transferScenario(
    pageId: string,
    messageId: string,
    opts: { targetGroupId?: string; copy: boolean },
  ): Promise<{ kind: 'state'; state: ScenarioPageState } | { kind: 'error'; message: string }> {
    const found = this.findMessage(pageId, messageId);
    if (!found || found.isGroup) {
      return { kind: 'error', message: 'Scenario not found' };
    }
    if (found.groupLocked) {
      return { kind: 'error', message: 'Group is locked' };
    }
    const token = await this.discordToken();
    const channelId = this.channel();
    const win = this.windows.get(pageId);
    if (!token || !channelId || !win) {
      return { kind: 'error', message: 'Discord channel or token is missing' };
    }
    let targetChannel = channelId;
    let nextOrder: number | undefined;
    if (opts.targetGroupId) {
      const parent = win.messages.find((msg) => msg.id === opts.targetGroupId);
      if (!parent || !isScenarioGroupMessage(parent.content)) {
        return { kind: 'error', message: 'Target group not found' };
      }
      if (parseScenarioGroupChip(parent.content).status === 'lock') {
        return { kind: 'error', message: 'Target group is locked' };
      }
      const thread = await ensureThread(
        token,
        channelId,
        parent,
        parseScenarioGroupChip(parent.content).title || SCENARIO_GROUP_DEFAULT_TITLE,
      );
      if (!thread.ok) {
        return { kind: 'error', message: thread.message };
      }
      parent.thread = thread.value;
      parent.hasThread = true;
      const existing: DiscordMessage[] = win.threads.get(thread.value.id) || [];
      if (existing.filter((msg: DiscordMessage) => isScenarioMessage(msg.content)).length >= SCENARIO_GROUP_MAX) {
        return { kind: 'error', message: `This group already has ${SCENARIO_GROUP_MAX} scenarios` };
      }
      nextOrder =
        existing.reduce(
          (max: number, msg: DiscordMessage) => Math.max(max, parseScenarioChip(msg.content).order || 0),
          0,
        ) + 1;
      targetChannel = thread.value.id;
    }
    const parsed = parseScenarioChip(found.msg.content);
    const body = formatScenarioDiscordBody({
      title: parsed.title || SCENARIO_DEFAULT_TITLE,
      steep: parsed.steep ?? 0,
      order: nextOrder,
    });
    const sourceFile = mdAttachment(found.msg);
    let md = win.mdById.get(messageId);
    if (sourceFile) {
      const downloaded = await fetchAttachmentText(token, sourceFile.url);
      if (!downloaded.ok) {
        return { kind: 'error', message: downloaded.message };
      }
      md = downloaded.value;
      win.mdById.set(messageId, md);
    }
    const filename = sourceFile?.filename || `${messageId}.md`;
    let posted;
    if (sourceFile || md) {
      posted = await postMessageWithAttachment(
        token,
        targetChannel,
        body,
        filename,
        Buffer.from(md ?? '', 'utf8'),
      );
    } else {
      posted = await postChannelMessage(token, targetChannel, body);
    }
    if (!posted.ok) {
      return { kind: 'error', message: posted.message };
    }
    const copyHasFile =
      !sourceFile || !!posted.value.attachments?.some((file) => file.filename === filename);
    if (!copyHasFile) {
      return {
        kind: 'error',
        message: `Discord accepted the message but did not attach ${filename}`,
      };
    }
    if (opts.targetGroupId) {
      const parent = win.messages.find((msg) => msg.id === opts.targetGroupId);
      if (parent?.thread?.id) {
        const bucket = win.threads.get(parent.thread.id) || [];
        bucket.push(posted.value);
        win.threads.set(parent.thread.id, bucket);
        if (md) {
          win.mdById.set(posted.value.id, md);
        }
        await this.syncGroupCounter(pageId, opts.targetGroupId);
      }
    } else {
      win.messages.push(posted.value);
      if (md) {
        win.mdById.set(posted.value.id, md);
      }
    }
    if (!opts.copy) {
      await this.deleteMessage(pageId, messageId);
    }
    return { kind: 'state', state: this.snapshot(pageId) };
  }

  /** Reject a second form, a locked group, a chip that already has a file, or an empty skill path. */
  beginForm(pageId: string, messageId: string): { kind: 'ok' } | { kind: 'error'; message: string } {
    if (this.formSession) {
      return { kind: 'error', message: 'Scenario form is already running' };
    }
    const found = this.findMessage(pageId, messageId);
    if (!found || found.isGroup) {
      return { kind: 'error', message: 'Scenario not found' };
    }
    if (found.groupLocked) {
      return { kind: 'error', message: 'Group is locked' };
    }
    if (mdAttachment(found.msg)) {
      return { kind: 'error', message: 'Scenario already has a file' };
    }
    if (!this.store.activeScenarioPaths().skillPath) {
      return { kind: 'error', message: 'Scenario skill path is not set in the active profile' };
    }
    this.formSession = { pageId, messageId, phase: 'questions' };
    return { kind: 'ok' };
  }

  /** First agent pass. Returns 2–3 boundary questions, or idle if the session was cancelled. */
  async askFormQuestions(): Promise<
    | { kind: 'questions'; pageId: string; messageId: string; questions: ScenarioFormQuestion[] }
    | { kind: 'error'; message: string }
    | { kind: 'idle' }
  > {
    const session = this.formSession;
    if (!session || session.phase !== 'questions') {
      return { kind: 'idle' };
    }
    const found = this.findMessage(session.pageId, session.messageId);
    if (!found || found.isGroup) {
      this.formSession = null;
      return { kind: 'error', message: 'Scenario not found' };
    }
    const paths = this.store.activeScenarioPaths();
    const title = parseScenarioChip(found.msg.content).title || SCENARIO_DEFAULT_TITLE;
    const prompt = [
      `Follow the skill at: ${this.skillAbs()}`,
      'Pass: questions',
      `Chip title: ${title}`,
      'Return only one json block of 2 or 3 boundary questions. Do not write a diagram. Do not write files.',
    ].join('\n');
    const agent = await runScenarioAsk({
      cwd: this.cwd(),
      prompt,
      model: paths.model,
      printThinking: paths.printThinking,
      printTools: paths.printTools,
    });
    if (this.formSession !== session) {
      return { kind: 'idle' };
    }
    if (!agent.ok) {
      this.formSession = null;
      return { kind: 'error', message: agent.message };
    }
    const questions = parseScenarioQuestions(agent.answer);
    if (!questions) {
      agent.report('В ответе агента нет 2–3 вопросов.', false);
      this.formSession = null;
      return { kind: 'error', message: 'В ответе агента нет 2–3 вопросов' };
    }
    session.phase = 'ready';
    session.questions = questions;
    agent.report('Вопросы получены.', true);
    return {
      kind: 'questions',
      pageId: session.pageId,
      messageId: session.messageId,
      questions,
    };
  }

  /** Drop the session on a host failure, including a diagram pass that threw. */
  clearForm(): void {
    this.formSession = null;
  }

  /** Drop a session that is still waiting for answers. A running diagram pass stays. */
  cancelForm(pageId: string, messageId: string): void {
    const session = this.formSession;
    if (!session || session.pageId !== pageId || session.messageId !== messageId) {
      return;
    }
    if (session.phase === 'diagram') {
      return;
    }
    this.formSession = null;
  }

  /** Second agent pass. Attaches the diagram markdown and recounts steep. */
  async answerForm(
    pageId: string,
    messageId: string,
    answers: { id: string; optionId: string }[],
  ): Promise<{ kind: 'ok' } | { kind: 'error'; message: string } | { kind: 'idle' }> {
    const session = this.formSession;
    if (
      !session ||
      session.pageId !== pageId ||
      session.messageId !== messageId ||
      session.phase !== 'ready' ||
      !session.questions
    ) {
      return { kind: 'idle' };
    }
    const pairs: { prompt: string; label: string }[] = [];
    for (const question of session.questions) {
      const picked = answers.find((item) => item.id === question.id);
      const option = question.options.find((item) => item.id === picked?.optionId);
      if (!option) {
        this.formSession = null;
        return { kind: 'error', message: 'Scenario form answer is incomplete' };
      }
      pairs.push({ prompt: question.prompt, label: option.label });
    }
    session.phase = 'diagram';
    const found = this.findMessage(pageId, messageId);
    if (!found || found.isGroup) {
      this.formSession = null;
      return { kind: 'error', message: 'Scenario not found' };
    }
    const paths = this.store.activeScenarioPaths();
    const title = parseScenarioChip(found.msg.content).title || SCENARIO_DEFAULT_TITLE;
    const prompt = [
      `Follow the skill at: ${this.skillAbs()}`,
      'Pass: diagram',
      `Chip title: ${title}`,
      'Boundaries:',
      ...pairs.map((pair) => `- ${pair.prompt}: ${pair.label}`),
      'Answer with the diagram markdown. The first line of the answer starts with #. Do not write files. Do not ask questions.',
    ].join('\n');
    const agent = await runScenarioAsk({
      cwd: this.cwd(),
      prompt,
      model: paths.model,
      printThinking: paths.printThinking,
      printTools: paths.printTools,
    });
    if (this.formSession !== session) {
      return { kind: 'idle' };
    }
    if (!agent.ok) {
      this.formSession = null;
      return { kind: 'error', message: agent.message };
    }
    const md = scenarioDiagramFromAnswer(agent.answer);
    if (!md) {
      agent.report('крепить нечего', false);
      this.formSession = null;
      return { kind: 'error', message: 'крепить нечего' };
    }
    const token = await this.discordToken();
    if (!token) {
      this.formSession = null;
      return { kind: 'error', message: 'Discord bot token is missing' };
    }
    const latest = this.findMessage(pageId, messageId);
    if (!latest || latest.isGroup) {
      this.formSession = null;
      return { kind: 'error', message: 'Scenario not found' };
    }
    const parsed = parseScenarioChip(latest.msg.content);
    const body = formatScenarioDiscordBody({
      title: parsed.title || SCENARIO_DEFAULT_TITLE,
      date: parsed.date,
      steep: countScenarioSteeps(md),
      order: parsed.order,
    });
    const edited = await editMessageWithAttachment(
      token,
      latest.channelOrThreadId,
      messageId,
      body,
      `${messageId}.md`,
      Buffer.from(md, 'utf8'),
    );
    if (!edited.ok) {
      agent.report(edited.message, false);
      this.formSession = null;
      return { kind: 'error', message: edited.message };
    }
    this.replaceMessage(pageId, latest, edited.value);
    this.windows.get(pageId)?.mdById.set(messageId, md);
    this.formSession = null;
    agent.report('Схема прикреплена к сообщению.', true);
    this.emit(pageId);
    return { kind: 'ok' };
  }

  private skillAbs(): string {
    const skillPath = this.store.activeScenarioPaths().skillPath;
    if (!skillPath) {
      return '';
    }
    return path.isAbsolute(skillPath) ? skillPath : path.join(this.cwd(), skillPath);
  }

  private findMessage(
    pageId: string,
    messageId: string,
  ):
    | {
        msg: DiscordMessage;
        channelOrThreadId: string;
        isGroup: boolean;
        groupId?: string;
        groupLocked: boolean;
      }
    | undefined {
    const win = this.windows.get(pageId);
    const channelId = this.channel();
    if (!win || !channelId) {
      return undefined;
    }
    const root = win.messages.find((msg) => msg.id === messageId);
    if (root) {
      return {
        msg: root,
        channelOrThreadId: channelId,
        isGroup: isScenarioGroupMessage(root.content),
        groupLocked: false,
      };
    }
    for (const parent of win.messages) {
      if (!parent.thread?.id || !isScenarioGroupMessage(parent.content)) {
        continue;
      }
      const bucket = win.threads.get(parent.thread.id) || [];
      const child = bucket.find((msg) => msg.id === messageId);
      if (child) {
        return {
          msg: child,
          channelOrThreadId: parent.thread.id,
          isGroup: false,
          groupId: parent.id,
          groupLocked: parseScenarioGroupChip(parent.content).status === 'lock',
        };
      }
    }
    return undefined;
  }

  private replaceMessage(
    pageId: string,
    found: { msg: DiscordMessage; channelOrThreadId: string; isGroup: boolean; groupId?: string },
    next: DiscordMessage,
  ): void {
    const win = this.windows.get(pageId);
    if (!win) {
      return;
    }
    if (found.groupId) {
      const bucket = win.threads.get(found.channelOrThreadId);
      if (!bucket) {
        return;
      }
      const idx = bucket.findIndex((msg) => msg.id === found.msg.id);
      if (idx >= 0) {
        bucket[idx] = {
          ...next,
          attachments: next.attachments?.length ? next.attachments : found.msg.attachments,
        };
      }
      return;
    }
    const idx = win.messages.findIndex((msg) => msg.id === found.msg.id);
    if (idx >= 0) {
      win.messages[idx] = {
        ...next,
        thread: next.thread ?? found.msg.thread,
        hasThread: next.hasThread || found.msg.hasThread,
        attachments: next.attachments?.length ? next.attachments : found.msg.attachments,
      };
    }
  }

  dispose(): void {
    this.formSession = null;
  }
}
