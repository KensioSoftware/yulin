/**
 * Memoization cache holding a bounded number of values.
 *
 * The bound stops a long-running process accumulating entries without limit.
 * Which values survive it matters little. A caller gets the same value back
 * either way, and an evicted one costs another call to the factory that made
 * it.
 *
 * Eviction is by insertion order, and a value read again stays where it is. A
 * memo worth bounding is one whose reads are hot, and reordering the cache on
 * every read costs more than the occasional recomputation it saves.
 *
 * A cached value has to be something (undefined stands for a key the cache is
 * missing). A hit then costs one map lookup.
 */
export class BoundedMemo<T extends NonNullable<unknown>> {
  private readonly cache = new Map<PropertyKey, T>();

  /**
   * Hold up to `limit` values, dropping the oldest to make room past that.
   */
  constructor(private readonly limit: number) {}

  /**
   * Returns the cached value for the given key, or creates and caches it using
   * `factory`.
   */
  getOrCreate<V extends T>(key: PropertyKey, factory: () => V): V {
    const cached = this.cache.get(key);

    if (cached !== undefined) {
      return cached as V;
    }

    const value = factory();
    this.cache.set(key, value);
    this.evictOverflow();
    return value;
  }

  /**
   * Returns whether the cache is currently holding `key`.
   */
  has(key: PropertyKey): boolean {
    return this.cache.has(key);
  }

  /**
   * Drop what was cached first, until the cache is back within its limit.
   */
  private evictOverflow(): void {
    while (this.cache.size > this.limit) {
      const oldest = this.cache.keys().next();

      /* v8 ignore next 3 -- a cache over its limit has a first key */
      if (oldest.done === true) {
        return;
      }

      this.cache.delete(oldest.value);
    }
  }
}
