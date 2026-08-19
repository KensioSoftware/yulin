import { SimApiGatewayBadRequest } from "../error/sim-api-gateway.error.js";
import type { SimRestApiOpenApiPointer } from "./sim-rest-api-openapi-pointer.js";

/**
 * Refuse a member of the document being imported, naming where it is.
 *
 * Every refusal an import makes is one of these, including the ones the
 * ordinary commands make about an input the document produced, so a reader
 * always has a pointer to follow into their own document.
 *
 * The wording names the import rather than the command, because `ImportRestApi`,
 * `PutRestApi` and a `Body` on an `AWS::ApiGateway::RestApi` all reach this
 * with the same document and the same refusals.
 */
export function simRestApiOpenApiRefusal(
  pointer: SimRestApiOpenApiPointer,
  reason: string,
): SimApiGatewayBadRequest {
  return new SimApiGatewayBadRequest(
    `Importing an OpenAPI document refused ${pointer.toString()}: ${reason}`,
  );
}
