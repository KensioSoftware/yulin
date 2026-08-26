/**
 * Whether a value matches a SQL `LIKE` pattern.
 *
 * `%` stands for any run of characters and `_` for exactly one. Everything
 * else in the pattern matches itself.
 *
 * This walks both strings once, remembering where the last `%` was so it can
 * come back and give it one more character. A regular expression built from
 * the pattern would do the same job, and a pattern alternating wildcards with
 * literals (`%a%a%a%ab`) would backtrack over every way of splitting the value
 * between them. `GetPartitions` runs this against every partition of a table
 * while the caller waits.
 *
 * Both are read as code points rather than as UTF-16 units, so `_` matches a
 * character outside the basic plane whole rather than half of one.
 */
export function simGlueLikeMatches(value: string, pattern: string): boolean {
  // A code point is the character SQL's `_` matches one of. Splitting further
  // into grapheme clusters would make `_` match a family emoji, and splitting
  // less would make it match half a character.
  // oxlint-disable-next-line typescript/no-misused-spread
  const text = [...value];
  // oxlint-disable-next-line typescript/no-misused-spread
  const wanted = [...pattern];

  let read = 0;
  let against = 0;
  let wildcard = -1;
  let resumed = 0;

  while (read < text.length) {
    if (matchesHere(text.at(read), wanted.at(against))) {
      read += 1;
      against += 1;
    } else if (wanted.at(against) === "%") {
      wildcard = against;
      resumed = read;
      against += 1;
    } else if (wildcard === -1) {
      return false;
    } else {
      resumed += 1;
      read = resumed;
      against = wildcard + 1;
    }
  }

  return wanted.slice(against).every((character) => character === "%");
}

/**
 * Whether the pattern character here takes the value character here.
 *
 * A pattern that has run out takes nothing, and the caller is still inside
 * the value when it asks.
 */
function matchesHere(
  character: string | undefined,
  wanted: string | undefined,
): boolean {
  if (wanted === undefined) {
    return false;
  }

  return wanted === "_" || wanted === character;
}
