/**
 * One path as an invalidation names it.
 *
 * CloudFront takes a path relative to the Distribution, beginning with a
 * slash. One arriving without a leading slash is read as though it had one, so
 * the bare `*` that clears everything is the same batch as `/*`.
 */
export function simCfInvalidationPath(path: string): string {
  const named = path.trim();

  return named.startsWith("/") ? named : `/${named}`;
}

/**
 * Whether a path an invalidation names covers a path the Distribution has
 * cached.
 *
 * A path on its own names one object. A path ending in a wildcard names
 * everything below what comes before it, so `/images/*` covers
 * `/images/logo.png` and leaves `/index.html` alone, and `/*` covers
 * everything the Distribution holds.
 */
export function simCfInvalidationCovers(
  invalidationPath: string,
  path: string,
): boolean {
  const named = simCfInvalidationPath(invalidationPath);

  return named.endsWith("*")
    ? path.startsWith(named.slice(0, -1))
    : path === named;
}

/**
 * Whether any path in a batch covers a path the Distribution has cached.
 */
export function simCfInvalidationBatchCovers(
  invalidationPaths: readonly string[],
  path: string,
): boolean {
  return invalidationPaths.some((invalidationPath) =>
    simCfInvalidationCovers(invalidationPath, path),
  );
}
