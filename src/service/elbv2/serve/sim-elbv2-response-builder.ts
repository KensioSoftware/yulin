import { SimElbV2BodyEncoding } from "./sim-elbv2-body-encoding.js";
import { SimElbV2ErrorResponse } from "./sim-elbv2-error-response.js";
import type { SimElbV2Result } from "./sim-elbv2-event.type.js";
import { simElbV2NullBodyStatuses } from "./sim-elbv2-null-body-statuses.js";

/**
 * The largest response real ELB takes from a Lambda target.
 *
 * The limit is on the whole response document rather than on the body alone,
 * so a base64 body counts at its encoded size and the headers count too.
 */
const maximumResponseBytes = 1024 * 1024;

/**
 * The response headers a load balancer writes itself rather than passing on.
 *
 * ELB does not honour hop-by-hop headers, and it computes the content length
 * from the body it is about to send, so a handler naming any of these is
 * naming something the load balancer decides.
 */
const loadBalancerOwnedHeaders: ReadonlySet<string> = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "transfer-encoding",
]);

/**
 * A handler result a load balancer can actually send, which is one carrying a
 * status code.
 */
type SimElbV2SendableResult = SimElbV2Result & { readonly statusCode: number };

/**
 * Turns what a Lambda target returned into the HTTP response the client sees.
 *
 * A load balancer takes one shape here, unlike API Gateway, which wraps
 * anything unrecognised in a 200. A result with no usable status code is not a
 * response ELB can send, so the client gets the load balancer's own 502 and
 * never sees the handler's shape.
 */
export class SimElbV2ResponseBuilder {
  private readonly bodyEncoding = new SimElbV2BodyEncoding();
  private readonly errorResponse = new SimElbV2ErrorResponse();

  /**
   * Build the HTTP response for one handler result.
   */
  build(result: unknown): Response {
    if (!this.isResult(result)) {
      return this.errorResponse.badGateway();
    }

    if (this.isTooLarge(result)) {
      return this.errorResponse.badGateway();
    }

    const statusCode = result.statusCode;
    const body = this.bodyEncoding.decode(
      result.body ?? "",
      result.isBase64Encoded ?? false,
    );

    return new Response(this.sendableBody(statusCode, body), {
      status: statusCode,
      statusText: this.statusText(result, statusCode),
      headers: this.headers(result),
    });
  }

  /**
   * Whether the handler returned something a load balancer can send.
   *
   * The status code is the whole of the test, as it is on real ELB: anything
   * else the result carries is optional, and a result without a status code in
   * the range a response can hold is malformed.
   */
  private isResult(result: unknown): result is SimElbV2SendableResult {
    if (typeof result !== "object" || result === null) {
      return false;
    }

    const statusCode = (result as SimElbV2Result).statusCode;

    return (
      Number.isSafeInteger(statusCode) &&
      typeof statusCode === "number" &&
      statusCode >= 200 &&
      statusCode <= 599
    );
  }

  /**
   * Whether the response document is larger than a load balancer takes back.
   *
   * The whole document is measured, as real ELB measures it, so a body that is
   * under the limit once decoded is still refused when its base64 and its
   * headers put the response over.
   */
  private isTooLarge(result: SimElbV2SendableResult): boolean {
    return Buffer.byteLength(JSON.stringify(result)) > maximumResponseBytes;
  }

  /**
   * The body actually sent, which is nothing for a status that cannot hold
   * one, and for an empty one.
   */
  private sendableBody(
    statusCode: number,
    body: Uint8Array | string,
  ): Uint8Array | string | null {
    if (simElbV2NullBodyStatuses.has(statusCode) || body.length === 0) {
      return null;
    }

    return body;
  }

  /**
   * The reason phrase the response carries.
   *
   * Real ELB takes a `statusDescription` such as `200 OK` and puts it in the
   * status line, where the code is already. The code is therefore taken off
   * again here, so a client reading the reason phrase finds `OK`, which is what
   * it would read from a real load balancer.
   */
  private statusText(result: SimElbV2Result, statusCode: number): string {
    const description = result.statusDescription ?? "";
    const prefix = `${String(statusCode)} `;

    if (description.startsWith(prefix)) {
      return description.slice(prefix.length);
    }

    return description;
  }

  private headers(result: SimElbV2Result): Headers {
    const headers = new Headers();
    const named = Object.entries(result.headers ?? {});

    for (const [name, value] of named) {
      if (!loadBalancerOwnedHeaders.has(name.toLowerCase())) {
        headers.set(name, value);
      }
    }

    return headers;
  }
}
