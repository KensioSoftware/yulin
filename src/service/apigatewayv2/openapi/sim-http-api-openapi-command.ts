import { SimApiGatewayV2BadRequest } from "../error/sim-api-gateway-v2.error.js";
import type { SimHttpApiOpenApiPointer } from "./sim-http-api-openapi-pointer.js";
import { simHttpApiOpenApiRefusal } from "./sim-http-api-openapi-refusal.js";

/**
 * Runs the ordinary commands an import creates its API's parts with, giving
 * whatever one of them refuses the pointer of the member the input came from.
 *
 * That is what lets route key grammar, payload format and issuer validation
 * stay stated once, where an SDK caller and a template already meet them,
 * while a refusal still sends the reader into their own document. Anything
 * that is not a refusal, such as the conflict two paths that are one route
 * produce, is passed on as it is.
 */
export class SimHttpApiOpenApiCommand {
  /**
   * Run one command, refusing under a pointer if it refuses.
   */
  run<T>(pointer: SimHttpApiOpenApiPointer, work: () => T): T {
    try {
      return work();
    } catch (error) {
      if (error instanceof SimApiGatewayV2BadRequest) {
        throw simHttpApiOpenApiRefusal(pointer, error.message);
      }

      throw error;
    }
  }
}
