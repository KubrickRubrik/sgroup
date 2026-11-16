import * as fs from 'fs/promises';
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

function isNoise(msg: DiscordMessage): boolean {
  return isDiscordSystemNotice(msg) || isConfigMessage(msg.content);
}

function isThreadStarter(msg: DiscordMessage): boolean {
  return msg.type === THREAD_STARTER_MESSAGE;
}

/** Quiet window: agent writes arrive as create plus several change events. */
const SCN_WRITE_SETTLE_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  private readonly pendingForm = new Map<string, { pageId: string; channelOrThreadId: string }>();
  private readonly scnSettleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly scnEpoch = new Map<string, number>();
  private readonly scnUploading = new Set<string>();
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

  private scnDir(): string {
    return path.join(this.cwd(), '.syn3', 'scn');
  }

  private scnPath(messageId: string): string {
    return path.join(this.scnDir(), `${messageId}.md`);
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

  /** Open chat with /scenarios and watch `.syn3/scn/<id>.md` for the finished file. */
  async startForm(
    pageId: string,
    messageId: string,
  ): Promise<{ kind: 'ok' } | { kind: 'error'; message: string }> {
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
    const paths = this.store.activeScenarioPaths();
    const title = parseScenarioChip(found.msg.content).title || SCENARIO_DEFAULT_TITLE;
    const outPath = path.posix.join('.syn3', 'scn', `${messageId}.md`);
    await fs.mkdir(this.scnDir(), { recursive: true });
    const prompt = [
      `/scenarios ${title}`,
      `Follow the skill at: ${paths.skillPath}`,
      `Write the finished Markdown only to: ${outPath}`,
      'Do not write to docs/scenarios.',
      'Do not put the chip title into the Markdown file.',
      paths.printThinking
        ? 'You may print reasoning in chat. Do not put reasoning into the Markdown file.'
        : 'Do not print reasoning into the Markdown file.',
      paths.printTools ? 'Tool calls are allowed.' : 'Do not call tools.',
      paths.model ? `Preferred model: ${paths.model}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    this.pendingForm.set(messageId, { pageId, channelOrThreadId: found.channelOrThreadId });
    this.armWatcher(messageId);
    try {
      await vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt });
    } catch {
      await vscode.env.clipboard.writeText(prompt);
      void vscode.window.showInformationMessage(
        'Syn3: prompt copied. Paste it into Agent chat to form the scenario.',
      );
    }
    return { kind: 'ok' };
  }

  private armWatcher(messageId: string): void {
    if (this.watchers.has(messageId)) {
      return;
    }
    const pattern = new vscode.RelativePattern(this.cwd(), `.syn3/scn/${messageId}.md`);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const handle = (uri: vscode.Uri) => {
      this.scheduleScnConsume(messageId, uri.fsPath);
    };
    watcher.onDidCreate(handle);
    watcher.onDidChange(handle);
    this.watchers.set(messageId, watcher);
  }

  /** Each create/change restarts the quiet window so only one settled copy is uploaded. */
  private scheduleScnConsume(messageId: string, filePath: string): void {
    if (!this.pendingForm.has(messageId)) {
      return;
    }
    const epoch = (this.scnEpoch.get(messageId) ?? 0) + 1;
    this.scnEpoch.set(messageId, epoch);
    const prev = this.scnSettleTimers.get(messageId);
    if (prev) {
      clearTimeout(prev);
    }
    const timer = setTimeout(() => {
      this.scnSettleTimers.delete(messageId);
      void this.consumeScnFile(messageId, filePath, epoch);
    }, SCN_WRITE_SETTLE_MS);
    this.scnSettleTimers.set(messageId, timer);
  }

  private isScnEpoch(messageId: string, epoch: number): boolean {
    return this.scnEpoch.get(messageId) === epoch;
  }

  private async readScnText(filePath: string): Promise<string | undefined> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch {
      return undefined;
    }
  }

  private async readSettledScn(
    messageId: string,
    filePath: string,
    epoch: number,
  ): Promise<'skip' | 'retry' | { md: string }> {
    if (!this.isScnEpoch(messageId, epoch) || !this.pendingForm.has(messageId)) {
      return 'skip';
    }
    const first = await this.readScnText(filePath);
    if (!this.isScnEpoch(messageId, epoch)) {
      return 'skip';
    }
    if (first === undefined || !first.trim() || !/```\s*mermaid/i.test(first)) {
      return 'skip';
    }
    await delay(SCN_WRITE_SETTLE_MS);
    if (!this.isScnEpoch(messageId, epoch) || !this.pendingForm.has(messageId)) {
      return 'skip';
    }
    const second = await this.readScnText(filePath);
    if (second === undefined) {
      return 'skip';
    }
    if (second !== first) {
      return 'retry';
    }
    return { md: second };
  }

  private releaseScnWatcher(messageId: string): void {
    const timer = this.scnSettleTimers.get(messageId);
    if (timer) {
      clearTimeout(timer);
    }
    this.scnSettleTimers.delete(messageId);
    this.scnEpoch.delete(messageId);
    this.watchers.get(messageId)?.dispose();
    this.watchers.delete(messageId);
  }

  private async consumeScnFile(messageId: string, filePath: string, epoch: number): Promise<void> {
    const pending = this.pendingForm.get(messageId);
    if (!pending || !this.isScnEpoch(messageId, epoch)) {
      return;
    }
    if (this.scnUploading.has(messageId)) {
      if (!this.scnSettleTimers.has(messageId) && this.watchers.has(messageId)) {
        this.scheduleScnConsume(messageId, filePath);
      }
      return;
    }
    const settled = await this.readSettledScn(messageId, filePath, epoch);
    if (settled === 'skip') {
      return;
    }
    if (settled === 'retry') {
      this.scheduleScnConsume(messageId, filePath);
      return;
    }
    if (this.scnUploading.has(messageId) || !this.isScnEpoch(messageId, epoch)) {
      if (
        !this.scnSettleTimers.has(messageId) &&
        this.pendingForm.has(messageId) &&
        this.watchers.has(messageId)
      ) {
        this.scheduleScnConsume(messageId, filePath);
      }
      return;
    }
    this.scnUploading.add(messageId);
    try {
      const still = this.pendingForm.get(messageId);
      if (!still || !this.isScnEpoch(messageId, epoch)) {
        return;
      }
      const token = await this.discordToken();
      if (!token) {
        return;
      }
      const found = this.findMessage(still.pageId, messageId);
      if (!found) {
        return;
      }
      const parsed = parseScenarioChip(found.msg.content);
      const body = formatScenarioDiscordBody({
        title: parsed.title || SCENARIO_DEFAULT_TITLE,
        date: parsed.date,
        steep: countScenarioSteeps(settled.md),
        order: parsed.order,
      });
      const edited = await editMessageWithAttachment(
        token,
        found.channelOrThreadId,
        messageId,
        body,
        path.basename(filePath),
        Buffer.from(settled.md, 'utf8'),
      );
      if (!edited.ok) {
        void vscode.window.showErrorMessage(`Syn3: ${edited.message}`);
        return;
      }
      if (!this.isScnEpoch(messageId, epoch) || !this.pendingForm.has(messageId)) {
        if (
          !this.scnSettleTimers.has(messageId) &&
          this.pendingForm.has(messageId) &&
          this.watchers.has(messageId)
        ) {
          this.scheduleScnConsume(messageId, filePath);
        }
        return;
      }
      const latest = await this.readScnText(filePath);
      if (latest !== settled.md) {
        this.scheduleScnConsume(messageId, filePath);
        return;
      }
      this.replaceMessage(still.pageId, found, edited.value);
      this.windows.get(still.pageId)?.mdById.set(messageId, settled.md);
      this.pendingForm.delete(messageId);
      this.releaseScnWatcher(messageId);
      try {
        await fs.unlink(filePath);
      } catch {
        // Already gone.
      }
      this.emit(still.pageId);
    } finally {
      this.scnUploading.delete(messageId);
    }
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
    for (const timer of this.scnSettleTimers.values()) {
      clearTimeout(timer);
    }
    this.scnSettleTimers.clear();
    this.scnEpoch.clear();
    this.scnUploading.clear();
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();
  }
}
