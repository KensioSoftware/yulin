import { SimProxyBodyEncoding } from "../proxy/sim-proxy-body-encoding.js";
import type {
  SimPayload1Result,
  SimPayload1StructuredResult,
} from "./sim-payload-1-event.type.js";

/**
 * Turns a payload format 1.0 handler result into the HTTP response the client
 * sees.
 *
 * A REST API proxy integration takes one shape only. A handler returning
 * anything without a numeric `statusCode` produces a 502 from real API
 * Gateway, with `Internal server error` in the body, because the integration
 * response could not be read. Payload format 2.0 is the lenient one, wrapping
 * an unrecognised value in a 200, and a handler relying on that behaves
 * differently here for the same reason it does on AWS.
 */
export class SimPayload1ResponseBuilder {
  private readonly bodyEncoding = new SimProxyBodyEncoding();

  /**
   * Whether a handler result is a response API Gateway can send.
   */
  isStructuredResult(result: unknown): result is SimPayload1StructuredResult {
    return (
      typeof result === "object" &&
      result !== null &&
      "statusCode" in result &&
      typeof (result as SimPayload1Result).statusCode === "number"
    );
  }

  /**
   * Build the HTTP response for one structured handler result.
   */
  build(result: SimPayload1StructuredResult): Response {
    const headers = new Headers();
    const single = Object.entries(result.headers ?? {});
    const repeated = Object.entries(result.multiValueHeaders ?? {});

    for (const [name, value] of single) {
      headers.set(name, String(value));
    }

    // multiValueHeaders wins over the single-value map for a name in both,
    // which is what lets a handler send one header twice.
    for (const [name, values] of repeated) {
      headers.delete(name);

      for (const value of values) {
        headers.append(name, String(value));
      }
    }

    const body = this.bodyEncoding.decode(
      result.body ?? "",
      result.isBase64Encoded ?? false,
    );

    return new Response(
      // An empty body is sent as no body at all, so statuses that must not
      // carry one, such as 204, stay valid responses.
      body.length === 0 ? null : body,
      { status: result.statusCode, headers },
    );
  }
}
