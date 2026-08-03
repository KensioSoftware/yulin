import { SimHttpApiOpenApiOperation } from "./sim-http-api-openapi-operation.js";
import type { SimHttpApiOpenApiValue } from "./sim-http-api-openapi-value.js";

/**
 * The operation keys one route is created for.
 *
 * These are handled by name rather than by uppercasing whatever a path item
 * carries, so `parameters` never becomes a route key called `PARAMETERS`.
 */
const operationKeys = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
];

/**
 * The path item members that would change what the API serves and are not
 * simulated.
 */
const refusedPathItemMembers: readonly (readonly [string, string])[] = [
  [
    "trace",
    "an HTTP API route key with a TRACE method is not established, so a " +
      "trace operation is refused rather than turned into a route key that " +
      "may not exist on AWS",
  ],
  [
    "$ref",
    "a path item reference is not resolved. Only a reference into " +
      "#/components/x-amazon-apigateway-integrations is simulated.",
  ],
  [
    "x-amazon-apigateway-any-method",
    "a catch-all method for an HTTP API is not established by AWS, so it is " +
      "refused rather than turned into an ANY route key. Declare the methods " +
      "the path serves instead.",
  ],
];

interface SimHttpApiOpenApiPathItemProperties {
  readonly path: string;
  readonly value: SimHttpApiOpenApiValue;
}

/**
 * One path of the document being imported, and the operations under it.
 *
 * `parameters`, `summary`, `description` and `tags` are skipped with no
 * effect. HTTP APIs derive path parameters from the path template and validate
 * nothing else, so there is nothing for a declared parameter to configure.
 */
export class SimHttpApiOpenApiPathItem {
  public readonly path: string;
  private readonly value: SimHttpApiOpenApiValue;

  constructor(properties: SimHttpApiOpenApiPathItemProperties) {
    this.path = properties.path;
    this.value = properties.value;
  }

  /**
   * The operations under this path, one route each.
   */
  operations(): readonly SimHttpApiOpenApiOperation[] {
    const item = this.value.object();

    for (const [name, reason] of refusedPathItemMembers) {
      item.refuseMember(name, reason);
    }

    return operationKeys
      .filter((key) => item.has(key))
      .map(
        (key) =>
          new SimHttpApiOpenApiOperation({
            routeKey: `${key.toUpperCase()} ${this.path}`,
            value: item.member(key),
          }),
      );
  }
}
