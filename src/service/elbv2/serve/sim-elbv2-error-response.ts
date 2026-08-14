/**
 * The responses a load balancer generates itself, rather than getting from a
 * target.
 *
 * Real ELB answers these with a short HTML page naming the status, which is
 * what a browser shows when a target is missing or broken. The status code is
 * the part worth asserting on: the page is reproduced so that a response looks
 * like one a load balancer sent, not so that anything reads it.
 */
export class SimElbV2ErrorResponse {
  /**
   * The target could not be invoked, or answered with something that is not a
   * response.
   *
   * This is what a Lambda target produces when the load balancer may not
   * invoke it, when the function is not there, when the handler throws, and
   * when what the handler returns has no usable status code.
   */
  badGateway(): Response {
    return this.build(502, "Bad Gateway");
  }

  /**
   * There was no target to send the request to.
   *
   * Real ELB answers this when a target group has no registered targets, or
   * none of them is in service.
   */
  serviceUnavailable(): Response {
    return this.build(503, "Service Unavailable");
  }

  /**
   * The request body is larger than a Lambda target takes.
   */
  payloadTooLarge(): Response {
    return this.build(413, "Payload Too Large");
  }

  private build(status: number, reason: string): Response {
    const title = `${String(status)} ${reason}`;

    return new Response(
      `<html>\n<head><title>${title}</title></head>\n` +
        `<body>\n<center><h1>${title}</h1></center>\n</body>\n</html>\n`,
      {
        status,
        statusText: reason,
        headers: { "content-type": "text/html" },
      },
    );
  }
}
