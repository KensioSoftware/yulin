/**
 * The error responses a Function URL endpoint returns itself, before or
 * instead of the function producing one.
 *
 * Real Lambda answers these with a small JSON document rather than the
 * handler's output, so client code that reads the body of a failed Function
 * URL call sees the same shape here.
 */
export class SimLambdaUrlErrorResponse {
  /**
   * No Function URL is served at this hostname.
   */
  notFound(): Response {
    return this.jsonResponse(404, "Not Found");
  }

  /**
   * The Function URL requires authentication the simulator cannot verify.
   */
  forbidden(): Response {
    return this.jsonResponse(403, "Forbidden");
  }

  /**
   * The function failed to handle the invocation.
   */
  internalServerError(): Response {
    return this.jsonResponse(502, "Internal Server Error");
  }

  private jsonResponse(status: number, message: string): Response {
    return Response.json(
      { Message: message },
      {
        status,
        headers: { "content-type": "application/json" },
      },
    );
  }
}
