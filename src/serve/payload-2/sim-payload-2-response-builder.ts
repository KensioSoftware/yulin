import { SimPayload2BodyEncoding } from "./sim-payload-2-body-encoding.js";
import type {
  SimPayload2Result,
  SimPayload2StructuredResult,
} from "./sim-payload-2-event.type.js";

const jsonContentType = "application/json";

/**
 * Turns a payload format 2.0 handler result into the HTTP response the client
 * sees.
 *
 * Real AWS accepts two shapes here: a structured response carrying a
 * statusCode, or any other value, which it wraps in a 200 JSON response. That
 * second rule is why a handler returning `{ body: "hi" }` and nothing else
 * produces a 200 whose body is the JSON `{"body":"hi"}`: without a statusCode
 * there is no structured response to read, so the whole object is the value.
 * Both are supported so handlers written either way behave as they would on
 * AWS.
 */
export class SimPayload2ResponseBuilder {
  private readonly bodyEncoding = new SimPayload2BodyEncoding();

  /**
   * Build the HTTP response for one handler result.
   */
  build(result: unknown): Response {
    if (this.isStructuredResult(result)) {
      return this.structuredResponse(result);
    }

    return Response.json(result ?? null, {
      status: 200,
      headers: { "content-type": jsonContentType },
    });
  }

  /**
   * Whether the handler returned a structured HTTP response rather than a
   * value to be JSON-encoded.
   */
  private isStructuredResult(
    result: unknown,
  ): result is SimPayload2StructuredResult {
    return (
      typeof result === "object" &&
      result !== null &&
      "statusCode" in result &&
      typeof (result as SimPayload2Result).statusCode === "number"
    );
  }

  private structuredResponse(result: SimPayload2StructuredResult): Response {
    const headers = new Headers();
    const resultHeaders = Object.entries(result.headers ?? {});
    const resultCookies = result.cookies ?? [];

    for (const [name, value] of resultHeaders) {
      headers.set(name, String(value));
    }

    for (const cookie of resultCookies) {
      headers.append("set-cookie", cookie);
    }

    if (!headers.has("content-type")) {
      headers.set("content-type", jsonContentType);
    }

    const body = this.bodyEncoding.decode(
      result.body ?? "",
      result.isBase64Encoded ?? false,
    );

    return new Response(
      // An empty body is sent as no body at all, so statuses that must not
      // carry one, such as 204, stay valid responses.
      body.length === 0 ? null : body,
      {
        status: result.statusCode,
        headers,
      },
    );
  }
}
