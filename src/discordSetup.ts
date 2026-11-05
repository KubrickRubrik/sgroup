import type { CatalogChannels } from './configFormat';
import {
  EXPLORER_CONFIG_PREFIX,
  LINKS_CONFIG_PREFIX,
  NOTES_CONFIG_PREFIX,
  PROFILE_CONFIG_PREFIX,
  REVIEW_CONFIG_PREFIX,
} from './configFormat';
import { listChannelMessages, postChannelMessage } from './discordApi';
import type { Syn3Locale } from './i18n';

export type SetupChannelKind = 'profile' | 'explorer' | 'notes' | 'links' | 'review';

export const SETUP_CHANNEL_KINDS: readonly SetupChannelKind[] = [
  'profile',
  'explorer',
  'notes',
  'links',
  'review',
];

const PREFIX_BY_KIND: Record<SetupChannelKind, string> = {
  profile: PROFILE_CONFIG_PREFIX,
  explorer: EXPLORER_CONFIG_PREFIX,
  notes: NOTES_CONFIG_PREFIX,
  links: LINKS_CONFIG_PREFIX,
  review: REVIEW_CONFIG_PREFIX,
};

const HELLO_ROLE_EN: Record<SetupChannelKind, string> = {
  profile: 'profile',
  explorer: 'the explorer map',
  notes: 'the notes map',
  links: 'the links map',
  review: 'the review map',
};

const HELLO_ROLE_RU: Record<SetupChannelKind, string> = {
  profile: 'профиля',
  explorer: 'карты проводника',
  notes: 'карты заметок',
  links: 'карты ссылок',
  review: 'карты ревью',
};

export function setupPrefix(kind: SetupChannelKind): string {
  return PREFIX_BY_KIND[kind];
}

/** Hello body: phrase + bare prefix on the next line (not a config header). */
export function setupHelloText(kind: SetupChannelKind, locale: Syn3Locale): string {
  const role = locale === 'en' ? HELLO_ROLE_EN[kind] : HELLO_ROLE_RU[kind];
  const line =
    locale === 'en'
      ? `Hello, this is Syn3. This channel is selected for ${role}.`
      : `Привет, это Syn3. Этот канал выбран для ${role}.`;
  return `${line}\n${setupPrefix(kind)}`;
}

export function isValidChannelId(value: string): boolean {
  return /^\d{5,}$/.test(value.trim());
}

/**
 * Non-empty review must not reuse profile / explorer / notes / links ids
 * (as entered; empty map channels are not separate ids).
 */
export function reviewChannelConflicts(
  review: string,
  channels: Pick<CatalogChannels, 'profile' | 'explorer' | 'notes' | 'links'>,
): boolean {
  const id = review.trim();
  if (!id) {
    return false;
  }
  const others = [
    channels.profile,
    channels.explorer,
    channels.notes,
    channels.links,
  ]
    .map((value) => (value || '').trim())
    .filter(Boolean);
  return others.includes(id);
}

/**
 * Find an existing setup hello (or any message containing the kind prefix).
 * If missing, post a new hello and confirm the response content.
 */
export async function ensureSetupProbe(
  token: string,
  channelId: string,
  kind: SetupChannelKind,
  locale: Syn3Locale,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const prefix = setupPrefix(kind);
  const listed = await listChannelMessages(token, channelId, { limit: 100 });
  if (!listed.ok) {
    return { ok: false, message: listed.message };
  }
  const existing = listed.value.find((msg) => msg.content.includes(prefix));
  if (existing) {
    return { ok: true };
  }
  const posted = await postChannelMessage(token, channelId, setupHelloText(kind, locale));
  if (!posted.ok) {
    return { ok: false, message: posted.message };
  }
  if (!posted.value.content.includes(prefix)) {
    return { ok: false, message: 'Discord returned an empty setup message' };
  }
  return { ok: true };
}
