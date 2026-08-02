import { SimHttpApiPathParameters } from "./sim-http-api-path-parameters.js";
import {
  greedySegmentRank,
  type SimHttpApiPathSegment,
} from "./sim-http-api-path-segment.js";

interface SimHttpApiRoutePathProperties {
  readonly text: string;
  readonly segments: readonly SimHttpApiPathSegment[];
}

/**
 * The path half of a route key, such as `/pets/{petId}`.
 *
 * The text is kept as the route key gave it, since that is what `RouteKey`
 * reports back and what reaches the handler as `event.routeKey`.
 */
export class SimHttpApiRoutePath {
  public readonly text: string;
  public readonly segments: readonly SimHttpApiPathSegment[];

  constructor(properties: SimHttpApiRoutePathProperties) {
    this.text = properties.text;
    this.segments = properties.segments;
  }

  /**
   * This path with every parameter name erased, which is what makes two route
   * keys differing only in parameter name the same route.
   */
  get signature(): string {
    return `/${this.segments.map((segment) => segment.signature).join("/")}`;
  }

  /**
   * How specific each segment is, in order, for route selection to compare.
   */
  get segmentRanks(): readonly number[] {
    return this.segments.map((segment) => segment.rank);
  }

  /**
   * Whether this path ends in a greedy segment, which puts it behind every
   * fully matching route.
   */
  get hasGreedySegment(): boolean {
    return this.segments.some((segment) => segment.rank === greedySegmentRank);
  }

  /**
   * Match this path against the segments of one request path, capturing
   * whatever its parameters name.
   *
   * The request has to be used up exactly: a path with segments left over
   * matches nothing, which is what keeps `GET /pets` from matching
   * `/pets/dog`.
   */
  match(
    requestSegments: readonly string[],
  ): SimHttpApiPathParameters | undefined {
    const parameters = new SimHttpApiPathParameters();
    let taken = 0;

    for (const segment of this.segments) {
      const matched = segment.consume(requestSegments.slice(taken));

      if (matched === undefined) {
        return undefined;
      }

      parameters.add(matched.parameter);
      taken += matched.consumed;
    }

    if (taken !== requestSegments.length) {
      return undefined;
    }

    return parameters;
  }
}
