interface SimCloudFrontPathPatternProperties {
  readonly pathPattern: string;
}

/**
 * CloudFront-style path pattern matcher.
 *
 * Supports the basic wildcard syntax:
 * - "*" matches zero or more characters
 * - "?" matches exactly one character
 *
 * All other characters are treated literally.
 */
export class SimCloudFrontPathPattern {
  private readonly graphemeSegmenter = new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  });
  private readonly pathPattern: string;

  constructor(properties: SimCloudFrontPathPatternProperties) {
    this.pathPattern = properties.pathPattern;
  }

  /**
   * Does this path pattern match a request path?
   */
  matches(requestPath: string): boolean {
    return this.regex().test(requestPath);
  }

  /**
   * Estimate how specific this pattern is for choosing between multiple matches.
   */
  specificity(): number {
    return this.graphemes(this.pathPattern).filter((char) => {
      return char !== "*" && char !== "?";
    }).length;
  }

  private regex(): RegExp {
    const safeRegexPattern = this.collapseStarRuns(
      this.graphemes(this.pathPattern),
    )
      .map((char) => {
        if (char === "*") {
          return ".*";
        }

        if (char === "?") {
          return ".";
        }

        return this.escapeRegexChar(char);
      })
      .join("");

    /*
     * Path patterns are not accepted as regex syntax. They are converted from a
     * small CloudFront-style wildcard language where only "*" and "?" have
     * special meaning. All other graphemes are escaped above.
     *
     * Stars the pattern keeps apart still compile to a `.*` each, and a pattern
     * holding a lot of them can take a backtracking engine a long time to
     * settle on a long near miss. That is left alone: a path pattern is written
     * into a Distribution by whoever configured it, never carried on a request,
     * so the only run a pathological one can hold up is their own.
     */
    // oxlint-disable-next-line security/detect-non-literal-regexp
    return new RegExp(`^${safeRegexPattern}$`, "u");
  }

  /**
   * Reduce each run of stars to a single star.
   *
   * A star already matches across `/`, so `**` means what `*` means, and
   * leaving the run would compile to `.*.*` and give the engine a needless
   * amount of backtracking to do on a long near miss. Stars are collapsed as
   * graphemes rather than in the raw pattern so that a star opening a cluster,
   * as the keycap `*️⃣` does, stays the literal it is read as below.
   */
  private collapseStarRuns(graphemes: readonly string[]): string[] {
    return graphemes.filter((char, index) => {
      return char !== "*" || graphemes[index - 1] !== "*";
    });
  }

  private graphemes(value: string): string[] {
    return Array.from(this.graphemeSegmenter.segment(value), (segment) => {
      return segment.segment;
    });
  }

  private escapeRegexChar(char: string): string {
    return char.replaceAll(/[\\^$.*+?()[\]{}|]/gu, String.raw`\$&`);
  }
}
