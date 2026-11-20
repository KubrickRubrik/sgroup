/** Review-map chip themes. Swatch order: MR, review, re-review, neurofix, explain, study. */

export const REVIEW_THEME_IDS = ['roles', 'syntax', 'explorer', 'rolesNear'] as const;

export type ReviewThemeId = (typeof REVIEW_THEME_IDS)[number];

export const REVIEW_THEME_DEFAULT: ReviewThemeId = 'explorer';

export const REVIEW_THEME_ROLES = [
  'mr',
  'review',
  'rereview',
  'neurofix',
  'explain',
  'study',
] as const;

export type ReviewThemeRole = (typeof REVIEW_THEME_ROLES)[number];

/** Roles that have their own Discord message. Neurofix is painted from the parent review. */
export type ReviewStoredRole = Exclude<ReviewThemeRole, 'neurofix'>;

export const REVIEW_THEMES: Record<ReviewThemeId, readonly string[]> = {
  roles: ['#9aa3ab', '#7d92a6', '#6480af', '#6aa67c', '#9678aa', '#6aa8b4'],
  syntax: ['#9c9894', '#868e96', '#7a96ae', '#81b88b', '#c586c0', '#4ec9b0'],
  explorer: ['#9a9690', '#8090a0', '#6a7d9e', '#81b88b', '#c586c0', '#5b93c4'],
  rolesNear: ['#9aa3ab', '#7d92a6', '#6d8aa8', '#6aa67c', '#9678aa', '#6aa8b4'],
};

export function normalizeReviewTheme(value: unknown): ReviewThemeId {
  return typeof value === 'string' && (REVIEW_THEME_IDS as readonly string[]).includes(value)
    ? (value as ReviewThemeId)
    : REVIEW_THEME_DEFAULT;
}

export function reviewThemeColor(theme: ReviewThemeId, role: ReviewThemeRole): string {
  const index = REVIEW_THEME_ROLES.indexOf(role);
  const row = REVIEW_THEMES[theme] ?? REVIEW_THEMES[REVIEW_THEME_DEFAULT];
  return row[index] ?? row[1];
}

export function reviewThemeSwatches(theme: ReviewThemeId): readonly string[] {
  return REVIEW_THEMES[normalizeReviewTheme(theme)];
}
