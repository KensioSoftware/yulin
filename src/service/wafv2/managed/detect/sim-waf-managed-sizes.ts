/**
 * The sizes the four `SizeRestrictions_*` rules allow a component to reach.
 *
 * AWS documents every one of these figures, so these rules match exactly where
 * the rules they stand for match. A component of exactly the limit is allowed
 * and one byte more is not, which is the boundary a test about a large upload
 * or a long query string is really asking about.
 */
export const simWafManagedSizeLimits = {
  queryString: 2048,
  cookieHeader: 10_240,
  body: 8192,
  uriPath: 1024,
} as const;
