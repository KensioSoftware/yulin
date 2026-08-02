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
   * The route's authorizer did not accept the request.
   *
   * Everything from a missing token to a claim that does not hold answers this
   * one status and body, so a client learns that its token was not accepted
   * and nothing about which check it failed. The `www-authenticate` header
   * names the scheme, and carries a description only for the one case AWS
   * publishes one for.
   */
  unauthorized(errorDescription?: string): Response {
    return this.jsonResponse(401, "Unauthorized", {
      "www-authenticate": this.bearerChallenge(errorDescription),
    });
  }

  /**
   * Nothing at this API serves the request: no such API, or no route, or no
   * stage to serve it from.
   */
  notFound(): Response {
    return this.jsonResponse(404, "Not Found");
  }

  /**
   * The API's generated endpoint is switched off, or the route asks for a
   * scope the accepted token does not claim.
   *
   * AWS publishes neither the status nor the body for either case, so both are
   * what the endpoint was observed to answer rather than something documented.
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

  /**
   * The `www-authenticate` value a refused token gets back.
   *
   * Only the description AWS publishes is ever sent, and every other refusal
   * names the scheme and nothing else, rather than inventing wording. AWS does
   * not publish how it lays the parameters out around that description, so
   * they are comma-separated as RFC 6750 writes them.
   */
  private bearerChallenge(errorDescription?: string): string {
    if (errorDescription === undefined) {
      return "Bearer";
    }

    return `Bearer error="invalid_token", error_description="${errorDescription}"`;
  }

  private jsonResponse(
    status: number,
    message: string,
    headers: Record<string, string> = {},
  ): Response {
    return Response.json(
      { message },
      {
        status,
        headers: { "content-type": "application/json", ...headers },
      },
    );
  }
}
