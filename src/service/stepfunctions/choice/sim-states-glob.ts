/**
 * One step of a pattern, either the wildcard or a character to match.
 */
type SimStatesGlobToken =
  | { readonly wildcard: true }
  | { readonly char: string };

const wildcard: SimStatesGlobToken = { wildcard: true };

/**
 * Whether a string matches a `StringMatches` pattern.
 *
 * The pattern language is the one Amazon States Language defines for
 * `StringMatches`. `*` stands for any run of characters, and a backslash
 * escapes the character after it, so `\*` is a literal asterisk and `\\` a
 * literal backslash.
 *
 * The match is done by walking both strings. A pattern comes out of a state
 * machine definition, and turning one into a regular expression would put the
 * definition's author in charge of how long the match takes.
 */
export function simStatesGlobMatches(pattern: string, value: string): boolean {
  return matchTokens(readGlobTokens(pattern), value);
}

/**
 * Split a pattern into the steps it is made of, resolving its escapes.
 */
function readGlobTokens(pattern: string): readonly SimStatesGlobToken[] {
  const tokens: SimStatesGlobToken[] = [];

  for (let index = 0; index < pattern.length; index++) {
    const character = pattern.charAt(index);

    if (character === "\\" && index + 1 < pattern.length) {
      index += 1;
      tokens.push({ char: pattern.charAt(index) });
      continue;
    }

    if (character === "*") {
      tokens.push(wildcard);
      continue;
    }

    // A trailing backslash escapes nothing and stands for itself.
    tokens.push({ char: character });
  }

  return tokens;
}

/**
 * Match the tokens against a value, backtracking to the last wildcard.
 *
 * Each wildcard remembers where it started matching. Where the rest of the
 * pattern then fails, that wildcard takes one more character and the match
 * carries on from there, which is the whole of the backtracking this pattern
 * language needs.
 */
function matchTokens(
  tokens: readonly SimStatesGlobToken[],
  value: string,
): boolean {
  let token = 0;
  let character = 0;
  let lastWildcard = -1;
  let resumeAt = 0;

  while (character < value.length) {
    const current = tokens.at(token);

    if (current !== undefined && "wildcard" in current) {
      lastWildcard = token;
      resumeAt = character;
      token += 1;
      continue;
    }

    if (current !== undefined && current.char === value.charAt(character)) {
      token += 1;
      character += 1;
      continue;
    }

    if (lastWildcard === -1) {
      return false;
    }

    token = lastWildcard + 1;
    resumeAt += 1;
    character = resumeAt;
  }

  return tokens.slice(token).every((rest) => "wildcard" in rest);
}
