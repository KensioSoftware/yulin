import { simRestApiAnyMethod } from "../api/method/sim-rest-api-method.js";
import { simRestApiRootPath } from "../api/resource/sim-rest-api-resource.js";
import type { SimRestApiOpenApiPointer } from "./sim-rest-api-openapi-pointer.js";
import { SimRestApiOpenApiOperation } from "./sim-rest-api-openapi-operation.js";
import type { SimRestApiOpenApiValue } from "./sim-rest-api-openapi-value.js";

/**
 * The catch-all operation key, which becomes an `ANY` method.
 *
 * API Gateway defines it for REST APIs because OpenAPI itself has no way to
 * write one operation covering every HTTP method.
 */
const anyMethodKey = "x-amazon-apigateway-any-method";

/**
 * The operation keys a method is declared for, and the HTTP method each one
 * becomes.
 *
 * These are handled by name rather than by uppercasing whatever a path item
 * carries, so `parameters` never becomes a method called `PARAMETERS`.
 */
const operationKeys = new Map([
  ["get", "GET"],
  ["put", "PUT"],
  ["post", "POST"],
  ["delete", "DELETE"],
  ["options", "OPTIONS"],
  ["head", "HEAD"],
  ["patch", "PATCH"],
  [anyMethodKey, simRestApiAnyMethod],
]);

/**
 * The path item members that would change what the API serves and are not
 * simulated.
 */
const refusedPathItemMembers: readonly (readonly [string, string])[] = [
  [
    "trace",
    "a REST API method cannot be declared for TRACE, so a trace operation is " +
      "refused rather than turned into a method AWS would reject",
  ],
  [
    "$ref",
    "a path item reference is not resolved. Write the operations under the " +
      "path itself.",
  ],
];

interface SimRestApiOpenApiPathItemProperties {
  readonly path: string;
  readonly value: SimRestApiOpenApiValue;
}

/**
 * One path of the document being imported, and the operations under it.
 *
 * `parameters`, `summary`, `description` and `tags` are skipped with no
 * effect, which is what AWS does with them without a request validator. A
 * declared parameter configures validation, and validation is refused at the
 * root of the document.
 */
export class SimRestApiOpenApiPathItem {
  public readonly path: string;
  private readonly value: SimRestApiOpenApiValue;

  constructor(properties: SimRestApiOpenApiPathItemProperties) {
    this.path = properties.path;
    this.value = properties.value;
  }

  /**
   * Where in the document this path is, for a refusal about the resources it
   * becomes.
   */
  pointer(): SimRestApiOpenApiPointer {
    return this.value.pointer;
  }

  /**
   * The segments of this path, one resource of the tree each.
   *
   * An empty segment is refused rather than dropped. `/pets/` and `/pets` are
   * two paths of one document and one resource of one API, and dropping the
   * empty segment would leave the second operation declared on a resource the
   * first one already holds.
   */
  segments(): readonly string[] {
    if (!this.path.startsWith(simRestApiRootPath)) {
      throw this.value.refusal(
        `is '${this.path}', and a path is written from the root of the ` +
          "API, such as '/pets/{petId}'",
      );
    }

    if (this.path === simRestApiRootPath) {
      return [];
    }

    const segments = this.path.split(simRestApiRootPath).slice(1);

    if (segments.includes("")) {
      throw this.value.refusal(
        `is '${this.path}', which has an empty segment. A path carries one ` +
          `segment between each pair of separators and none at the end.`,
      );
    }

    return segments;
  }

  /**
   * The operations under this path, one method each.
   */
  operations(): readonly SimRestApiOpenApiOperation[] {
    const item = this.value.object();

    for (const [name, reason] of refusedPathItemMembers) {
      item.refuseMember(name, reason);
    }

    return item.memberNames().flatMap((key) => {
      const httpMethod = operationKeys.get(key);

      return httpMethod === undefined
        ? []
        : [
            new SimRestApiOpenApiOperation({
              httpMethod,
              value: item.member(key),
            }),
          ];
    });
  }
}
