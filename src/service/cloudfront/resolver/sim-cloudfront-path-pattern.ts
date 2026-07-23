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
    const safeRegexPattern = this.graphemes(this.pathPattern)
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
     */
    // eslint-disable-next-line security/detect-non-literal-regexp
    return new RegExp(`^${safeRegexPattern}$`, "u");
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
