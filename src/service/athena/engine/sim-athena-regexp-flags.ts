/** One of Java's inline flag groups at the head of a pattern, as `(?i)`. */
const leadingFlag = /^\(\?[ims]+\)/u;

/** One pattern and the flags to compile it with. */
export interface SimAthenaLiftedPattern {
  readonly pattern: string;
  readonly flags: string;
}

/**
 * One pattern with the flags Java writes inside it lifted out beside it.
 *
 * Athena's regular expressions are Joni, which reads `(?i)` at the head of a
 * pattern as a flag over the whole of it. JavaScript reads the same text as a
 * group and refuses it. `(?i)`, `(?m)` and `(?s)` map onto flags of the same
 * letter, and lifting them is all it takes.
 *
 * A flag Joni has and JavaScript has not, `(?x)` among them, stays in the
 * pattern for `RegExp` to turn down. So does a group written anywhere but the
 * head, since JavaScript has no way to turn a flag on part way through. The
 * scoped form `(?i:...)` needs nothing done to it and already runs.
 *
 * A flag group captures nothing in Java, so taking one off the front leaves
 * the capture groups numbered as the statement wrote them.
 */
export function simAthenaLiftedPattern(
  pattern: string,
  flags: string,
): SimAthenaLiftedPattern {
  const letters = new Set<string>();
  let rest = pattern;
  let head = leadingFlag.exec(rest);

  while (head !== null) {
    // Everything the group holds between its `(?` and its `)`.
    const written = head[0].slice(2, -1);

    for (const letter of written) {
      letters.add(letter);
    }

    rest = rest.slice(head[0].length);
    head = leadingFlag.exec(rest);
  }

  const added = [...letters].filter((letter) => !flags.includes(letter));

  return { pattern: rest, flags: flags + added.join("") };
}
