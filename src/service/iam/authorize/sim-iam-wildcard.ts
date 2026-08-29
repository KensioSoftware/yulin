import { BoundedMemo } from "../../../util/memo/bounded-memo.js";

interface SimIamWildcardMatchOptions {
  readonly caseSensitive: boolean;
}

/**
 * How many compiled patterns to keep, for each of the two case sensitivities.
 *
 * One realistic organization policy set produces fewer than a hundred distinct
 * patterns, and every request evaluates the same ones again. A few thousand
 * leaves room for many documents attached at once, and holds a few thousand
 * small regular expressions at worst.
 */
const compiledPatternLimit = 2000;

/*
 * Wildcard patterns already turned into regular expressions, held in a store
 * per case sensitivity so that a lookup needs no key built for it.
 *
 * A pattern's text and its case sensitivity decide the whole of what is
 * compiled. An entry made while evaluating one simulation's policies is the
 * entry another simulation would have made for itself. A compiled expression
 * also carries nothing from one use to the next, because the flags below leave
 * out "g" and "y", and `test` keeps a position only under those. These stores
 * therefore last as long as the process does, and a `SimAws` that goes out of
 * scope leaves them behind for the next one.
 */
const caseSensitivePatterns = new BoundedMemo<RegExp>(compiledPatternLimit);
const caseInsensitivePatterns = new BoundedMemo<RegExp>(compiledPatternLimit);

/**
 * Match an IAM-style wildcard pattern.
 *
 * "*" means zero or more characters and "?" means exactly one character.
 */
export function simIamWildcardMatch(
  pattern: string,
  value: string,
  options: SimIamWildcardMatchOptions,
): boolean {
  return patternRegExp(pattern, options.caseSensitive).test(value);
}

/**
 * The regular expression a pattern compiles to, compiling it the first time it
 * is asked for and reusing it afterwards.
 */
function patternRegExp(pattern: string, caseSensitive: boolean): RegExp {
  return caseSensitive
    ? caseSensitivePatterns.getOrCreate(pattern, () =>
        compilePattern(pattern, "u"),
      )
    : caseInsensitivePatterns.getOrCreate(pattern, () =>
        compilePattern(pattern, "iu"),
      );
}

/**
 * Turn a wildcard pattern into the regular expression that matches it.
 */
function compilePattern(pattern: string, flags: string): RegExp {
  const regexPattern = pattern
    .replaceAll(/[\\^$.*+?()[\]{}|]/gu, String.raw`\$&`)
    .replaceAll(String.raw`\*`, ".*")
    .replaceAll(String.raw`\?`, ".");

  /*
   * IAM wildcard patterns are not accepted as regex syntax. They are converted
   * from a small wildcard language where "*" and "?" have special meaning. All
   * other regex characters are escaped above.
   */
  // oxlint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(`^${regexPattern}$`, flags);
}
