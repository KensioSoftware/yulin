interface SimCdkBucketDeployFilterProperties {
  readonly exclude: readonly string[];
  readonly include: readonly string[];
}

/**
 * Decides which of a source's files a `BucketDeployment` copies.
 *
 * The provider function passes `Exclude` and `Include` through to `aws s3 sync`
 * as `--exclude` and `--include`, all the excludes first and then all the
 * includes, and the CLI applies them in that order with the last match winning.
 * That is what makes the common `exclude: ["*"], include: ["*.txt"]` pair mean
 * "only the text files". A file no pattern matches is copied.
 *
 * Patterns are matched against the path relative to the source root, and `*`
 * matches across `/` the way the CLI's do, so `data/*` covers the whole of a
 * `data` directory and `*.txt` covers a `.txt` file at any depth.
 */
export class SimCdkBucketDeployFilter {
  private readonly rules: readonly FilterRule[];

  constructor(properties: SimCdkBucketDeployFilterProperties) {
    this.rules = [
      ...properties.exclude.map((pattern) => new FilterRule(pattern, false)),
      ...properties.include.map((pattern) => new FilterRule(pattern, true)),
    ];
  }

  /**
   * Whether a path relative to the source root is part of this deployment.
   */
  includes(relativePath: string): boolean {
    let included = true;

    for (const rule of this.rules) {
      if (rule.matches(relativePath)) {
        included = rule.included;
      }
    }

    return included;
  }
}

class FilterRule {
  private readonly expression: RegExp;

  constructor(
    pattern: string,
    readonly included: boolean,
  ) {
    this.expression = filterExpression(pattern);
  }

  matches(relativePath: string): boolean {
    return this.expression.test(relativePath);
  }
}

/**
 * Turn one CLI filter pattern into a regular expression.
 *
 * `*` and `?` are the two wildcards CDK's own documentation shows, and are what
 * a deployment filter is written with in practice. The CLI also takes character
 * classes, which are refused here rather than matched literally: a pattern that
 * quietly means something other than it says would copy the wrong files, and
 * finding that out from a puzzling refusal beats finding it out from a
 * half-deployed Bucket.
 */
function filterExpression(pattern: string): RegExp {
  if (pattern.includes("[")) {
    throw new Error(
      `Sim CDK BucketDeployment filter pattern ${pattern} uses a character ` +
        `class, which simulated deployment filters do not support`,
    );
  }

  // Escape everything a regular expression would read, then turn the two
  // escaped wildcards back into the patterns they stand for. Doing it in that
  // order means a wildcard is never confused with a literal one.
  //
  // Runs of stars collapse to one first. A star already crosses `/`, so `**`
  // means what `*` means, and leaving it would compile to `.*.*` and give the
  // engine a needless amount of backtracking to do on a long near miss.
  const expression = pattern
    .replaceAll(/\*+/gu, "*")
    .replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`)
    .replaceAll(String.raw`\*`, ".*")
    .replaceAll(String.raw`\?`, ".");

  // eslint-disable-next-line security/detect-non-literal-regexp -- built from an escaped template pattern, not from anything a request carries
  return new RegExp(`^${expression}$`, "u");
}
