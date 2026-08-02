import { SimApiGatewayV2BadRequest } from "../../../error/sim-api-gateway-v2.error.js";

/**
 * The method token matching any method, which is what makes a route the one
 * for a path whatever the request did to it.
 */
export const simHttpApiAnyMethod = "ANY";

/**
 * The method tokens an HTTP API route key may name.
 */
const routeMethods = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  simHttpApiAnyMethod,
]);

export const exactMethodRank = 0;
export const anyMethodRank = 1;

/**
 * The method half of a route key, such as the `GET` of `GET /pets`.
 */
export class SimHttpApiRouteMethod {
  public readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  /**
   * Read a method token, naming the whole route key in anything refused.
   *
   * The token is upper-case or nothing, so `get /pets` is refused. That real
   * API Gateway refuses it at `CreateRoute` is observed rather than
   * documented, but a lower-case method here would be a route that never
   * matched a request, which is worse than being told about it early.
   */
  static parse(token: string, routeKey: string): SimHttpApiRouteMethod {
    if (!routeMethods.has(token)) {
      throw new SimApiGatewayV2BadRequest(
        `Route key '${routeKey}' does not name an HTTP method: a route key is ` +
          `either $default or an upper-case method and a path, such as ` +
          `'GET /pets'`,
      );
    }

    return new SimHttpApiRouteMethod(token);
  }

  /**
   * How specific this method is. An exact method beats `ANY`.
   */
  get rank(): number {
    if (this.token === simHttpApiAnyMethod) {
      return anyMethodRank;
    }

    return exactMethodRank;
  }

  /**
   * Whether a request of this method reaches this route.
   */
  matches(requestMethod: string): boolean {
    if (this.token === simHttpApiAnyMethod) {
      return true;
    }

    return this.token === requestMethod;
  }
}
