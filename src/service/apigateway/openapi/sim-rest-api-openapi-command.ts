import { SimApiGatewayBadRequest } from "../error/sim-api-gateway.error.js";
import type { SimRestApiOpenApiPointer } from "./sim-rest-api-openapi-pointer.js";
import { simRestApiOpenApiRefusal } from "./sim-rest-api-openapi-refusal.js";

/**
 * Runs the ordinary commands an import creates its API's parts with, giving
 * whatever one of them refuses the pointer of the member the input came from.
 *
 * That is what lets path part grammar, integration types and URI parsing stay
 * stated once, where an SDK caller and a template already meet them, while a
 * refusal still sends the reader into their own document. Anything that is not
 * a refusal, such as the conflict two paths that are one resource produce, is
 * passed on as it is.
 */
export class SimRestApiOpenApiCommand {
  /**
   * Run one command, refusing under a pointer if it refuses.
   */
  run<T>(pointer: SimRestApiOpenApiPointer, work: () => T): T {
    try {
      return work();
    } catch (error) {
      if (error instanceof SimApiGatewayBadRequest) {
        throw simRestApiOpenApiRefusal(pointer, error.message);
      }

      throw error;
    }
  }
}
