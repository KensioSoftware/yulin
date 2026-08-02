import { SimApiGatewayV2BadRequest } from "../../../error/sim-api-gateway-v2.error.js";
import { SimHttpApiRoutePathParser } from "../path/sim-http-api-route-path-parser.js";
import {
  SimHttpApiDefaultRouteKey,
  simHttpApiDefaultRouteKey,
} from "./sim-http-api-default-route-key.js";
import { SimHttpApiMethodRouteKey } from "./sim-http-api-method-route-key.js";
import { SimHttpApiRouteMethod } from "./sim-http-api-route-method.js";
import type { SimHttpApiRouteKey } from "./sim-http-api-route-key.js";

/**
 * Reads the `RouteKey` a `CreateRoute` request carries.
 *
 * A route key is either the literal `$default` or a method and a path
 * separated by one space. Everything else is refused here, which is where real
 * API Gateway refuses it too: a route key that cannot be read is a route that
 * would never match a request, and finding that out at request time rather
 * than at creation time is the failure worth avoiding.
 */
export class SimHttpApiRouteKeyParser {
  private readonly pathParser = new SimHttpApiRoutePathParser();

  /**
   * Read a route key, or refuse it.
   */
  parse(routeKey: string): SimHttpApiRouteKey {
    if (routeKey === simHttpApiDefaultRouteKey) {
      return new SimHttpApiDefaultRouteKey();
    }

    const parts = routeKey.split(" ");

    if (parts.length !== 2) {
      throw new SimApiGatewayV2BadRequest(
        `Route key '${routeKey}' is not a route key: a route key is either ` +
          `$default or a method and a path separated by one space, such as ` +
          `'GET /pets'`,
      );
    }

    const [method = "", path = ""] = parts;

    return new SimHttpApiMethodRouteKey({
      method: SimHttpApiRouteMethod.parse(method, routeKey),
      path: this.pathParser.parse(path, routeKey),
    });
  }
}
