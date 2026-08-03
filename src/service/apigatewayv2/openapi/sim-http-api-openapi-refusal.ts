import { SimApiGatewayV2BadRequest } from "../error/sim-api-gateway-v2.error.js";
import type { SimHttpApiOpenApiPointer } from "./sim-http-api-openapi-pointer.js";

/**
 * Refuse a member of the document being imported, naming where it is.
 *
 * Every refusal an import makes is one of these, including the ones the
 * ordinary commands make about an input the document produced, so a reader
 * always has a pointer to follow into their own document.
 */
export function simHttpApiOpenApiRefusal(
  pointer: SimHttpApiOpenApiPointer,
  reason: string,
): SimApiGatewayV2BadRequest {
  return new SimApiGatewayV2BadRequest(
    `ImportApi refused ${pointer.toString()}: ${reason}`,
  );
}
