import { SimHttpApiPathParameter } from "./sim-http-api-path-parameters.js";
import {
  greedySegmentRank,
  type SimHttpApiPathSegment,
  SimHttpApiSegmentMatch,
} from "./sim-http-api-path-segment.js";

/**
 * A route path segment capturing everything left of the path, such as
 * `{proxy+}`.
 *
 * It is only ever the last segment of a route path, which is what makes
 * "everything left" well defined.
 */
export class SimHttpApiGreedySegment implements SimHttpApiPathSegment {
  public readonly rank = greedySegmentRank;
  /**
   * Every greedy segment has the same signature, whatever the name is.
   */
  public readonly signature = "{+}";
  public readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Take everything left of the request path.
   *
   * Two things here are observed rather than documented. A greedy segment
   * needs at least one segment to match, so `GET /pets/{proxy+}` does not
   * match `/pets`. And the captured value has no leading slash, so `/pets` and
   * `cat/1` produce `cat/1` rather than `/cat/1`.
   */
  consume(remaining: readonly string[]): SimHttpApiSegmentMatch | undefined {
    if (remaining.length === 0) {
      return undefined;
    }

    return new SimHttpApiSegmentMatch(
      remaining.length,
      new SimHttpApiPathParameter(this.name, remaining.join("/")),
    );
  }
}
