import {
  literalSegmentRank,
  type SimHttpApiPathSegment,
  SimHttpApiSegmentMatch,
} from "./sim-http-api-path-segment.js";

/**
 * A route path segment naming one exact path segment, such as `pets`.
 *
 * It captures nothing, and it is the most specific kind of segment: a request
 * matching a literal here matches nothing more general at the same position.
 */
export class SimHttpApiLiteralSegment implements SimHttpApiPathSegment {
  public readonly rank = literalSegmentRank;
  public readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  /**
   * A literal has no parameter name to erase, so it is its own signature.
   */
  get signature(): string {
    return this.text;
  }

  /**
   * Take the one request segment this literal names, when it is there.
   */
  consume(remaining: readonly string[]): SimHttpApiSegmentMatch | undefined {
    if (remaining[0] !== this.text) {
      return undefined;
    }

    return new SimHttpApiSegmentMatch(1);
  }
}
