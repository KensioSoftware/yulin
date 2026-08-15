/**
 * What real Lambda says when it refuses a Function URL request.
 *
 * A refused request never reaches the handler and writes no log stream, so
 * this body is the only thing a deployment has to go on. The wording is real
 * Lambda's, down to the link, because that is what someone will be reading.
 */
export const simLambdaUrlForbiddenMessage =
  "Forbidden. For troubleshooting Function URL authorization issues, see: " +
  "https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html";

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
   * The caller is not allowed to invoke this Function URL.
   */
  forbidden(): Response {
    return this.jsonResponse(403, simLambdaUrlForbiddenMessage);
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
