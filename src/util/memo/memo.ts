/**
 * Simple memoization cache.
 */
export class Memo<T> {
  private readonly cache = new Map<PropertyKey, T>();

  /**
   * Returns the cached value for the given key, or creates/caches it using `factory`.
   */
  getOrCreate<V extends T>(key: PropertyKey, factory: () => V): V {
    if (this.cache.has(key)) {
      return this.cache.get(key) as V;
    }

    const value = factory();
    this.cache.set(key, value);
    return value;
  }

  /**
   * Returns whether the cache contains `key`.
   */
  has(key: PropertyKey): boolean {
    return this.cache.has(key);
  }

  /**
   * Returns what has been created so far, in the order it was created.
   *
   * Only what was actually asked for: reading this never makes anything, so a
   * caller that wants to do something to everything memoized here does it to
   * the things that exist rather than bringing the rest into being.
   */
  values(): readonly T[] {
    return this.cache.values().toArray();
  }
}
