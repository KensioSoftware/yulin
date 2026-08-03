import { SimHttpApiOpenApiPathItem } from "./sim-http-api-openapi-path-item.js";
import type { SimHttpApiOpenApiValue } from "./sim-http-api-openapi-value.js";

/**
 * The `paths` map of the document being imported.
 *
 * A path is taken verbatim: OpenAPI path templating is already API Gateway's
 * path parameter syntax, so `/orders/{orderId}` needs no translation to reach
 * a route key.
 */
export class SimHttpApiOpenApiPaths {
  private readonly value: SimHttpApiOpenApiValue;

  constructor(value: SimHttpApiOpenApiValue) {
    this.value = value;
  }

  /**
   * The path items this document declares, in the order it wrote them.
   */
  items(): readonly SimHttpApiOpenApiPathItem[] {
    const paths = this.value.object();

    return paths
      .memberNames()
      .map(
        (path) =>
          new SimHttpApiOpenApiPathItem({ path, value: paths.member(path) }),
      );
  }
}
