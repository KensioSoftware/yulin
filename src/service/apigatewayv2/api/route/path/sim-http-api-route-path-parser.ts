import { SimApiGatewayV2BadRequest } from "../../../error/sim-api-gateway-v2.error.js";
import { SimHttpApiPathSegmentParser } from "./sim-http-api-path-segment-parser.js";
import { greedySegmentRank } from "./sim-http-api-path-segment.js";
import type { SimHttpApiPathSegment } from "./sim-http-api-path-segment.js";
import { simHttpApiPathSegments } from "./sim-http-api-path-segments.js";
import { SimHttpApiRoutePath } from "./sim-http-api-route-path.js";

/**
 * Reads the path half of a route key into the segments it is made of.
 */
export class SimHttpApiRoutePathParser {
  private readonly segmentParser = new SimHttpApiPathSegmentParser();

  /**
   * Read a route key path, naming the whole route key in anything refused.
   */
  parse(path: string, routeKey: string): SimHttpApiRoutePath {
    if (!path.startsWith("/")) {
      throw new SimApiGatewayV2BadRequest(
        `Route key '${routeKey}' has the path '${path}', which does not ` +
          `start with a slash`,
      );
    }

    const segments = simHttpApiPathSegments(path).map((text) =>
      this.segmentParser.parse(text, routeKey),
    );
    this.requireGreedyLast(segments, routeKey);

    return new SimHttpApiRoutePath({ text: path, segments });
  }

  /**
   * Refuse a greedy segment anywhere but the end.
   *
   * A `{proxy+}` takes everything left of the path, so a segment after it
   * could never match anything.
   */
  private requireGreedyLast(
    segments: readonly SimHttpApiPathSegment[],
    routeKey: string,
  ): void {
    const greedyAt = segments.findIndex(
      (segment) => segment.rank === greedySegmentRank,
    );

    if (greedyAt === -1 || greedyAt === segments.length - 1) {
      return;
    }

    throw new SimApiGatewayV2BadRequest(
      `Route key '${routeKey}' has a greedy path parameter before the end of ` +
        `the path: a {name+} parameter takes the rest of the path, so nothing ` +
        `can follow it`,
    );
  }
}
