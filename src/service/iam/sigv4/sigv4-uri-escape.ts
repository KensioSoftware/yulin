/**
 * Percent-encode a value the way SigV4 canonicalization requires.
 *
 * Everything outside the unreserved set `A-Za-z0-9-_.~` is encoded, which is
 * `encodeURIComponent` plus the few characters it leaves alone.
 */
export function escapeSigV4Uri(value: string): string {
  return encodeURIComponent(value).replaceAll(
    /[!'()*]/g,
    (character) =>
      `%${(character.codePointAt(0) ?? 0).toString(16).toUpperCase()}`,
  );
}
