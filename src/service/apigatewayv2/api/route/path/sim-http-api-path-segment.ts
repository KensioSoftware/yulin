import type { SimHttpApiPathParameter } from "./sim-http-api-path-parameters.js";

/**
 * How specific each kind of path segment is, lower being more specific.
 *
 * A literal segment names one path, a `{name}` segment names any one segment,
 * and a `{proxy+}` segment names everything left. Route selection compares
 * these segment by segment, rather than counting characters, because it is the
 * segment where two routes first differ that decides between them.
 */
export const literalSegmentRank = 0;
export const variableSegmentRank = 1;
export const greedySegmentRank = 2;

/**
 * What one route path segment took from the front of a request path.
 */
export class SimHttpApiSegmentMatch {
  public readonly consumed: number;
  public readonly parameter?: SimHttpApiPathParameter | undefined;

  constructor(consumed: number, parameter?: SimHttpApiPathParameter) {
    this.consumed = consumed;
    this.parameter = parameter;
  }
}

/**
 * One segment of a route path.
 *
 * Each kind of segment answers the same questions, so matching a route is a
 * loop over its segments rather than a switch over segment kinds.
 */
export interface SimHttpApiPathSegment {
  /** How specific this kind of segment is. Lower is more specific. */
  readonly rank: number;
  /**
   * The segment with any parameter name erased.
   *
   * Two route keys differing only in a parameter name are the same route to
   * real API Gateway, so this is what a route is stored under.
   */
  readonly signature: string;
  /**
   * Take what this segment matches from the front of the request path segments
   * it is offered, or nothing when it does not match them.
   */
  consume(remaining: readonly string[]): SimHttpApiSegmentMatch | undefined;
}
