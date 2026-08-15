/**
 * The regular expression characters an ELB pattern holds as literals.
 *
 * `*` and `?` are absent on purpose: those are the two characters an ELB
 * pattern uses as wildcards, and they are turned into their regular expression
 * equivalents once everything else has been escaped.
 */
const regExpMetaCharacters = /[.+^${}()|[\]\\]/gu;

/**
 * One `host-header` or `path-pattern` value, compiled so a request can be
 * compared against it.
 *
 * Real ELB supports two wildcards, `*` for zero or more characters and `?` for
 * exactly one, and compares them against the whole of the host name or path
 * rather than against part of it. That whole-value comparison is the part that
 * surprises people: `/api/*` does not match `/api`, because the pattern has a
 * literal slash the path does not, and `*.example.com` does not match
 * `example.com` for the same reason.
 */
export class SimElbV2WildcardPattern {
  private readonly expression: RegExp;

  private constructor(pattern: string, flags: string) {
    const escaped = pattern.replaceAll(regExpMetaCharacters, String.raw`\$&`);
    const source = escaped.replaceAll("*", ".*").replaceAll("?", ".");

    /*
     * Anchored at both ends, because ELB compares a pattern against the whole
     * value rather than looking for it inside one.
     *
     * The pattern is not read as an expression: every character with a meaning
     * of its own is escaped above, and only the two ELB wildcards become
     * syntax. A pattern holding many of them compiles to as many `.*` runs and
     * can take a backtracking engine a while to settle on a long near miss,
     * which is left alone: a condition value is written by whoever wrote the
     * rule and is never carried on a request.
     */
    // oxlint-disable-next-line security/detect-non-literal-regexp
    this.expression = new RegExp(`^${source}$`, flags);
  }

  /**
   * Compile a pattern compared exactly as it is written, which is how real ELB
   * compares a path pattern.
   */
  static caseSensitive(pattern: string): SimElbV2WildcardPattern {
    return new SimElbV2WildcardPattern(pattern, "u");
  }

  /**
   * Compile a pattern compared without regard to case, which is how real ELB
   * compares a host name.
   */
  static caseInsensitive(pattern: string): SimElbV2WildcardPattern {
    return new SimElbV2WildcardPattern(pattern, "iu");
  }

  /**
   * Whether a value is one this pattern matches.
   */
  matches(value: string): boolean {
    return this.expression.test(value);
  }
}
