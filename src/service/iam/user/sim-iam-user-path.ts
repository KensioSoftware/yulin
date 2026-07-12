/**
 * Normalize an IAM user path to slash-delimited AWS form.
 */
export function normaliseUserPath(path?: string): string {
  if (path === undefined || path.length === 0) {
    return "/";
  }

  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;

  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}
