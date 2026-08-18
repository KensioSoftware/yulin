import type { SimS3ApiRequest } from "./sim-s3-api-request.js";

/**
 * One S3 REST operation, and how to read its input out of a request.
 *
 * S3 states its operation in the method, the shape of the path and a
 * sub-resource in the query string, so a route is matched on those three and
 * nothing else. Real S3 reads a request the same way, which is why `?policy`
 * and `?website` on the same `PUT /{Bucket}` reach different operations.
 */
export interface SimS3ApiRoute {
  readonly method: string;
  readonly target: "service" | "bucket" | "object";
  /**
   * The query string that picks this operation out of the others sharing its
   * method and path. Undefined matches a request naming no sub-resource at all.
   */
  readonly subResource?: string | undefined;
  /**
   * A further condition on the query string, for the operations that share a
   * method, a path and a sub-resource with another. Only the two listings do.
   */
  readonly matches?: ((query: URLSearchParams) => boolean) | undefined;
  readonly commandName: string;
  readonly input: (request: SimS3ApiRequest) => object;
}
