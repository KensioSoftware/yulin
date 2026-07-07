/**
 * Normalise a sim IAM policy path by adding and removing slashes.
 */
export function normalisePolicyPath(path: string | undefined): string {
  if (path === undefined || path.length === 0) {
    return "/";
  }

  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}
