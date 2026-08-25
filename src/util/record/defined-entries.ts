/**
 * The same object without the keys whose value is undefined.
 *
 * A response built by spreading optional fields carries a key for every one of
 * them, and an assertion comparing it against what a caller declared then
 * trips over keys nobody set. Real AWS responses leave an absent field out
 * altogether, so this puts the response back to that shape.
 */
export function definedEntries<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
