import { SimLambdaUrlBodyEncoding } from "../event/sim-lambda-url-body-encoding.js";
import type {
  SimLambdaFunctionUrlResult,
  SimLambdaFunctionUrlStructuredResult,
} from "../event/sim-lambda-url-event.type.js";

const jsonContentType = "application/json";

/**
 * Turns a Function URL handler result into the HTTP response the client sees.
 *
 * Real Lambda accepts two shapes here: a structured response carrying a
 * statusCode, or any other value, which it wraps in a 200 JSON response. Both
 * are supported so handlers written either way behave as they would on AWS.
 */
export class SimLambdaUrlResponseBuilder {
  private readonly bodyEncoding = new SimLambdaUrlBodyEncoding();

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
  ): result is SimLambdaFunctionUrlStructuredResult {
    return (
      typeof result === "object" &&
      result !== null &&
      "statusCode" in result &&
      typeof (result as SimLambdaFunctionUrlResult).statusCode === "number"
    );
  }

  private structuredResponse(
    result: SimLambdaFunctionUrlStructuredResult,
  ): Response {
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
