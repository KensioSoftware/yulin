/**
 * Decode percent escapes and `+` as a space, as WAF's URL_DECODE does.
 *
 * Consecutive escapes are decoded as one run, because a non-ASCII character
 * arrives as several of them and decoding a byte at a time would leave the
 * whole sequence encoded.
 *
 * An escape that decodes to nothing is left as it stands rather than failing
 * the whole match. WAF still inspects malformed input, and a rule that threw
 * its hands up at it would be a way past the rule.
 */
export function simWafUrlDecode(value: string): string {
  /*
   * The repeated group is fixed width and every alternative starts with a
   * character the others cannot, so each position is decided without
   * backtracking. The unsafe-expression check reads the nested quantifier and
   * cannot see that.
   */
  // oxlint-disable-next-line security/detect-unsafe-regex
  const escapeRun = /\+|(?:%[\da-f]{2})+/giu;

  return value.replaceAll(escapeRun, (escapes) => {
    if (escapes === "+") {
      return " ";
    }

    try {
      return decodeURIComponent(escapes);
    } catch {
      return decodeEachEscape(escapes);
    }
  });
}

/**
 * Decode what can be decoded in a run of escapes, leaving the rest alone.
 *
 * A run that is not valid UTF-8 still holds escapes that stand for a character
 * on their own, and WAF inspects what it can read of it.
 */
function decodeEachEscape(escapes: string): string {
  return (escapes.match(/%[\da-f]{2}/giu) ?? [])
    .map((escape) => {
      try {
        return decodeURIComponent(escape);
      } catch {
        return escape;
      }
    })
    .join("");
}
