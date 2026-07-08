/**
 * Normalise an IAM Role path to the AWS-style slash-delimited form.
 */
export function normaliseRolePath(path?: string): string {
  if (path === undefined || path.length === 0) {
    return "/";
  }

  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}
