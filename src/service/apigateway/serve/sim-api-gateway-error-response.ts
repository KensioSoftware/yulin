/**
 * The error responses a REST API endpoint returns itself, before or instead of
 * an integration producing one.
 *
 * Real API Gateway answers these with a small JSON document whose field is
 * `message`. The wording is what the endpoint was observed to answer, since
 * AWS publishes neither the status nor the body for most of them.
 */
export class SimApiGatewayErrorResponse {
  /**
   * Nothing at this API serves the request.
   *
   * `Missing Authentication Token` is the message real API Gateway is well
   * known for, and it answers a path that matched no method just as much as
   * one that needed credentials. A client reading it here reads what it would
   * read on AWS, misleading wording and all.
   */
  missingAuthenticationToken(): Response {
    return this.jsonResponse(403, "Missing Authentication Token");
  }

  /**
   * No such API, or a stage the API does not serve.
   */
  forbidden(): Response {
    return this.jsonResponse(403, "Forbidden");
  }

  /**
   * The integration could not be reached, or answered something that is not a
   * response.
   */
  badGateway(): Response {
    return this.jsonResponse(502, "Internal server error");
  }

  private jsonResponse(status: number, message: string): Response {
    return Response.json(
      { message },
      { status, headers: { "content-type": "application/json" } },
    );
  }
}
