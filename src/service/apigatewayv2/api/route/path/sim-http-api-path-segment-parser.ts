import { SimApiGatewayV2BadRequest } from "../../../error/sim-api-gateway-v2.error.js";
import { SimHttpApiGreedySegment } from "./sim-http-api-greedy-segment.js";
import { SimHttpApiLiteralSegment } from "./sim-http-api-literal-segment.js";
import type { SimHttpApiPathSegment } from "./sim-http-api-path-segment.js";
import { SimHttpApiVariableSegment } from "./sim-http-api-variable-segment.js";

/**
 * A `{name}` or `{name+}` segment. The name is what reaches the handler as a
 * path parameter, so it is the character set a JavaScript property name can
 * hold without quoting.
 */
const parameterSegment = /^\{(?<name>[\w.-]+)(?<greedy>\+)?\}$/;

/**
 * Reads one segment of a route key path.
 *
 * A segment is either a literal or a parameter, and anything in between, such
 * as `{petId` or `pets{id}`, is refused at `CreateRoute`. Real API Gateway
 * refuses it there too, which is the point of parsing this early rather than
 * discovering it when a request fails to match.
 */
export class SimHttpApiPathSegmentParser {
  /**
   * Read one path segment, naming the whole route key in anything refused so
   * the caller can see which route it came from.
   */
  parse(text: string, routeKey: string): SimHttpApiPathSegment {
    if (!text.includes("{") && !text.includes("}")) {
      return this.literal(text, routeKey);
    }

    const groups = parameterSegment.exec(text)?.groups;
    const name = groups?.["name"];

    if (name === undefined) {
      throw new SimApiGatewayV2BadRequest(
        `Route key '${routeKey}' has the malformed path segment '${text}': ` +
          "a segment is either a literal, a {name} parameter, or a {name+} " +
          "greedy parameter",
      );
    }

    if (groups?.["greedy"] === undefined) {
      return new SimHttpApiVariableSegment(name);
    }

    return new SimHttpApiGreedySegment(name);
  }

  private literal(text: string, routeKey: string): SimHttpApiLiteralSegment {
    if (text.length === 0) {
      throw new SimApiGatewayV2BadRequest(
        `Route key '${routeKey}' has an empty path segment`,
      );
    }

    return new SimHttpApiLiteralSegment(text);
  }
}
