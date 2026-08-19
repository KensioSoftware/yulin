import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";

/**
 * A literal path segment, or a `{name}` path parameter, or a `{name+}` greedy
 * path parameter.
 */
const pathPartPattern = /^(?:[a-zA-Z0-9._~:@-]+|\{[a-zA-Z0-9._-]+\+?\})$/;

/**
 * The name inside a `{name}` or `{name+}` path part.
 */
const parameterPattern = /^\{(?<name>[a-zA-Z0-9._-]+)(?<greedy>\+?)\}$/;

/**
 * One segment of a REST API resource path.
 *
 * API Gateway builds a path out of resources rather than storing it whole, and
 * each resource holds one segment. A segment is a literal, a `{name}` path
 * parameter matching one segment, or a `{name+}` greedy parameter matching the
 * rest of the path. Only one greedy parameter can appear on a path, and it is
 * always the last segment, which is why a resource carrying one takes no
 * children.
 */
export class SimRestApiPathPart {
  public readonly pathPart: string;

  /** The parameter name, for a `{name}` or `{name+}` part. */
  public readonly parameterName: string | undefined;

  public readonly greedy: boolean;

  private constructor(
    pathPart: string,
    parameterName: string | undefined,
    greedy: boolean,
  ) {
    this.pathPart = pathPart;
    this.parameterName = parameterName;
    this.greedy = greedy;
  }

  /**
   * Read a path part, refusing one real API Gateway would refuse.
   */
  static parse(pathPart: string): SimRestApiPathPart {
    if (!pathPartPattern.test(pathPart)) {
      throw new SimApiGatewayBadRequest(
        `Path part '${pathPart}' is invalid. A path part is one segment, ` +
          "written as a literal such as 'orders', a path parameter such as " +
          "'{orderId}', or a greedy path parameter such as '{proxy+}'",
      );
    }

    const groups = parameterPattern.exec(pathPart)?.groups;

    return new SimRestApiPathPart(
      pathPart,
      groups?.["name"],
      groups?.["greedy"] === "+",
    );
  }
}
