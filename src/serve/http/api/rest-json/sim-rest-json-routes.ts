import {
  simRestJsonPathSegments,
  type SimRestJsonRequest,
} from "./sim-rest-json-request.js";
import type { SimRestJsonRoute } from "./sim-rest-json-route.type.js";

/**
 * A request matched to the operation its path names, and the members that path
 * stated along the way.
 */
export interface SimRestJsonMatch {
  readonly route: SimRestJsonRoute;
  readonly labels: ReadonlyMap<string, string>;
}

/**
 * Find the operation a REST-JSON request names.
 *
 * A template matches a request only when it has the same number of segments
 * and every literal segment is the segment the request sent. That is what
 * keeps a path this endpoint has no operation for from being answered by one
 * that happens to share its method: `GET /2015-03-31/functions/orders/aliases`
 * has no route, and matches neither `GET /2015-03-31/functions/{FunctionName}`
 * nor anything else, because a label stands for one segment rather than for
 * the rest of the path.
 *
 * Returns undefined for a request matching no route, which is either an
 * operation the simulated service has not implemented or one the real service
 * does not have.
 */
export function resolveSimRestJsonRoute(
  routes: readonly SimRestJsonRoute[],
  request: SimRestJsonRequest,
): SimRestJsonMatch | undefined {
  for (const route of routes) {
    if (route.method !== request.method) {
      continue;
    }

    const labels = matchSimRestJsonPath(route.path, request.segments);
    if (labels !== undefined) {
      return { route, labels };
    }
  }

  return undefined;
}

/**
 * Match one path template against the segments a request sent, and read the
 * labels out of it.
 */
function matchSimRestJsonPath(
  template: string,
  segments: readonly string[],
): ReadonlyMap<string, string> | undefined {
  const expected = simRestJsonPathSegments(template);
  if (expected.length !== segments.length) {
    return undefined;
  }

  const labels = new Map<string, string>();
  for (const [index, part] of expected.entries()) {
    const segment = segments.at(index) ?? "";

    if (part.startsWith("{") && part.endsWith("}")) {
      labels.set(part.slice(1, -1), segment);
      continue;
    }

    if (part !== segment) {
      return undefined;
    }
  }

  return labels;
}
