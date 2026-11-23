/**
 * Whether a value is one of a fixed list of strings, narrowing it to that
 * list's type where it is.
 *
 * `Array.prototype.includes` takes only the array's own element type, so it
 * cannot test a wider value and narrows nothing when it answers true.
 */
export function isOneOf<T extends string>(
  values: readonly T[],
  value: string | undefined,
): value is T {
  const wider: readonly (string | undefined)[] = values;

  return wider.includes(value);
}
