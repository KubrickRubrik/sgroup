/** Review-map chip schemes. Paint lives in the map CSS. Absent means Soft Semantic. */

export const REVIEW_SCHEME_IDS = [
  'softSemantic',
  'highContrast',
  'mutedPastel',
  'neonOutline',
  'softFilled',
  'warmEarthy',
  'coolTech',
] as const;

export type ReviewSchemeId = (typeof REVIEW_SCHEME_IDS)[number];

export const REVIEW_SCHEME_DEFAULT: ReviewSchemeId = 'softSemantic';

export const REVIEW_SCHEME_LABELS: Record<ReviewSchemeId, string> = {
  softSemantic: 'Soft Semantic',
  highContrast: 'High-Contrast Flat',
  mutedPastel: 'Muted Pastel Dark',
  neonOutline: 'Neon Outline',
  softFilled: 'Soft Filled',
  warmEarthy: 'Warm Earthy',
  coolTech: 'Cool Tech',
};

export function normalizeReviewScheme(value: unknown): ReviewSchemeId {
  return typeof value === 'string' && (REVIEW_SCHEME_IDS as readonly string[]).includes(value)
    ? (value as ReviewSchemeId)
    : REVIEW_SCHEME_DEFAULT;
}
