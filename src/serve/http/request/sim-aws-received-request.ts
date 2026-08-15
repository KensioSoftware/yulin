import { stripSimAwsControlHeaders } from "../../../service/iam/request/sim-aws-control-headers.js";

/**
 * An HTTP request as it arrived at the simulated AWS boundary.
 *
 * The body is read exactly once, here, because a request body is a stream that
 * cannot be consumed twice and two things need it: the SigV4 payload hash, and
 * whatever the simulated service builds from the request. Everything
 * downstream is handed the same bytes.
 */
export class SimAwsReceivedRequest {
  /**
   * The request body, or undefined when the request carried none.
   */
  public readonly body?: Uint8Array | undefined;

  private readonly received: Request;

  private constructor(received: Request, body: Uint8Array | undefined) {
    this.received = received;
    this.body = body;
  }

  /**
   * Take a request in, buffering its body.
   */
  static async receive(request: Request): Promise<SimAwsReceivedRequest> {
    const body =
      request.body === null
        ? undefined
        : new Uint8Array(await request.arrayBuffer());

    return new SimAwsReceivedRequest(request, body);
  }

  /**
   * The request as the simulated service should see it.
   *
   * Simulator control headers are stripped, so a Lambda handler echoing
   * `event.headers` never sees them, and the buffered body is reattached so
   * the service can read it as usual.
   */
  forService(): Request {
    const headers = new Headers(this.received.headers);

    stripSimAwsControlHeaders(headers);

    return new Request(this.received.url, {
      method: this.received.method,
      headers,
      ...(this.body !== undefined && { body: this.body }),
    });
  }
}
