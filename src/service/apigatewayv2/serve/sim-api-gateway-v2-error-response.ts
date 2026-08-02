/**
 * The error responses an HTTP API endpoint returns itself, before or instead
 * of an integration producing one.
 *
 * Real API Gateway answers these with a small JSON document rather than the
 * handler's output. The field is lower-case `message`, which is what an HTTP
 * API uses; a Lambda Function URL uses `Message` for the same thing, so the
 * two are not interchangeable and client code reading one of them sees here
 * what it would see on AWS.
 */
export class SimApiGatewayV2ErrorResponse {
  /**
   * Nothing at this API serves the request: no such API, or no route, or no
   * stage to serve it from.
   */
  notFound(): Response {
    return this.jsonResponse(404, "Not Found");
  }

  /**
   * The API's generated endpoint is switched off.
   *
   * AWS publishes neither the status nor the body for this case, so both are
   * what a disabled endpoint was observed to answer rather than something
   * documented.
   */
  forbidden(): Response {
    return this.jsonResponse(403, "Forbidden");
  }

  /**
   * The integration failed to handle the request.
   */
  internalServerError(): Response {
    return this.jsonResponse(500, "Internal Server Error");
  }

  private jsonResponse(status: number, message: string): Response {
    return Response.json(
      { message },
      {
        status,
        headers: { "content-type": "application/json" },
      },
    );
  }
}
