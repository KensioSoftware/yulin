interface SimIamWildcardMatchOptions {
  readonly caseSensitive: boolean;
}

/**
 * Match an IAM-style wildcard pattern.
 *
 * Initial support is small: "*" means zero or more characters.
 */
export function simIamWildcardMatch(
  pattern: string,
  value: string,
  options: SimIamWildcardMatchOptions,
): boolean {
  return wildcardMatch(pattern, value, options);
}

function wildcardMatch(
  pattern: string,
  value: string,
  options: SimIamWildcardMatchOptions,
): boolean {
  const regexPattern = pattern
    .replaceAll(/[\\^$.*+?()[\]{}|]/gu, String.raw`\$&`)
    .replaceAll(String.raw`\*`, ".*");

  /*
   * IAM wildcard patterns are not accepted as regex syntax. They are converted
   * from a small wildcard language where only "*" has special meaning. All other
   * characters are escaped above.
   */
  // eslint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(
    `^${regexPattern}$`,
    options.caseSensitive ? "u" : "iu",
  ).test(value);
}
