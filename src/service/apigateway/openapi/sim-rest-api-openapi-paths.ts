import { SimRestApiOpenApiPathItem } from "./sim-rest-api-openapi-path-item.js";
import type { SimRestApiOpenApiValue } from "./sim-rest-api-openapi-value.js";

/**
 * The `paths` map of the document being imported.
 *
 * A path is taken verbatim: OpenAPI path templating is already API Gateway's
 * path parameter syntax, so `/pets/{petId}` needs no translation on its way to
 * a resource per segment.
 */
export class SimRestApiOpenApiPaths {
  private readonly value: SimRestApiOpenApiValue;

  constructor(value: SimRestApiOpenApiValue) {
    this.value = value;
  }

  /**
   * The path items this document declares, in the order it wrote them.
   */
  items(): readonly SimRestApiOpenApiPathItem[] {
    const paths = this.value.object();

    return paths
      .memberNames()
      .map(
        (path) =>
          new SimRestApiOpenApiPathItem({ path, value: paths.member(path) }),
      );
  }
}
