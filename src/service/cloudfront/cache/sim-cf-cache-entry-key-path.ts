/**
 * Where the request path sits in a cache entry key.
 */
const cacheEntryKeyPathIndex = 2;

/**
 * The request path one cache entry was keyed under.
 *
 * `simCfCacheEntryKey` builds the key as a JSON array with the path third in
 * it, and this reads that element back out. An invalidation matches entries by
 * path this way, and the cache keeps its one map keyed on the whole key.
 *
 * A key of another shape answers with nothing. An invalidation then leaves the
 * entry where it is.
 */
export function simCfCacheEntryKeyPath(key: string): string | undefined {
  const parts: unknown = JSON.parse(key);

  if (!Array.isArray(parts)) {
    return undefined;
  }

  const path: unknown = parts.at(cacheEntryKeyPathIndex);

  return typeof path === "string" ? path : undefined;
}
