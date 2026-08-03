import { MappedFactory } from "@kensio/part-factory";

import type { JSONObject } from "../../../util/type-guard/json.js";

/**
 * What a test asks for when it wants an OpenAPI document to import.
 *
 * `paths` and `components` are empty by default rather than carrying an
 * operation of their own, so a test states the one path item or security
 * scheme it is about and nothing is merged into it.
 */
export interface SimHttpApiOpenApiDocumentInput {
  readonly openapi: string;
  readonly title: string;
  readonly paths: JSONObject;
  readonly components: JSONObject;
}

/**
 * Builds the OpenAPI 3.0 document an `ImportApi` or an `AWS::ApiGatewayV2::Api`
 * `Body` carries.
 *
 * ```typescript
 * const document = simHttpApiOpenApiDocumentFactory.make({
 *   paths: { "/orders": { get: { "x-amazon-apigateway-integration": ... } } },
 * });
 * ```
 *
 * The envelope is incidental to every test about what an import does with one
 * member, which is what earns this its place.
 */
export const simHttpApiOpenApiDocumentFactory = new MappedFactory<
  SimHttpApiOpenApiDocumentInput,
  JSONObject
>(
  () => ({
    openapi: "3.0.1",
    title: "orders",
    paths: {},
    components: {},
  }),
  (input) => ({
    openapi: input.openapi,
    info: { title: input.title, version: "1.0" },
    paths: input.paths,
    components: input.components,
  }),
);
