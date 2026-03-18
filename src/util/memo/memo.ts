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
}
