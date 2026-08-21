/**
 * A union over the keys of `T`, where one key is given and the rest refused.
 *
 * Writing such a union out by hand means every member declares every other
 * member's key as `?: never`, and a key's documentation lands once per member.
 * `T` names each key once, and this builds the union from it.
 *
 * The optional `never` keys are what keep the members exclusive. An object
 * literal naming two of the keys satisfies no member at all.
 */
export type ExactlyOne<T> = {
  [K in keyof T]: Readonly<Pick<T, K>> &
    Readonly<Partial<Record<Exclude<keyof T, K>, never>>>;
}[keyof T];
