import { SimHttpApiPathParameter } from "./sim-http-api-path-parameters.js";
import {
  type SimHttpApiPathSegment,
  SimHttpApiSegmentMatch,
  variableSegmentRank,
} from "./sim-http-api-path-segment.js";

/**
 * A route path segment capturing one path segment, such as `{petId}`.
 *
 * It matches exactly one segment, whatever is in it, and the value reaches the
 * handler as `event.pathParameters.petId`.
 */
export class SimHttpApiVariableSegment implements SimHttpApiPathSegment {
  public readonly rank = variableSegmentRank;
  /**
   * Every parameter segment has the same signature, whatever the name is, so
   * `GET /pets/{id}` and `GET /pets/{petId}` are one route.
   */
  public readonly signature = "{}";
  public readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Take the one request segment this parameter names, when there is one with
   * something in it.
   */
  consume(remaining: readonly string[]): SimHttpApiSegmentMatch | undefined {
    const [value] = remaining;

    if (value === undefined || value.length === 0) {
      return undefined;
    }

    return new SimHttpApiSegmentMatch(
      1,
      new SimHttpApiPathParameter(this.name, value),
    );
  }
}
