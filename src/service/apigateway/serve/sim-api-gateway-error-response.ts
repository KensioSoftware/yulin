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
   * The request carried nothing at the authorizer's identity source, or the
   * authorizer answered `Unauthorized`.
   */
  unauthorized(): Response {
    return this.jsonResponse(401, "Unauthorized");
  }

  /**
   * A Deny statement in the authorizer's policy matched the method.
   *
   * The body names the deny, and its member is `Message` where every other
   * message here is `message`. Real API Gateway is inconsistent about the two
   * and this follows it.
   */
  explicitDeny(): Response {
    return this.messageResponse(
      403,
      "User is not authorized to access this resource with an explicit deny",
    );
  }

  /**
   * The authorizer's policy allowed nothing covering the method.
   */
  implicitDeny(): Response {
    return this.messageResponse(
      403,
      "User is not authorized to access this resource",
    );
  }

  /**
   * The method's authorizer could not answer at all.
   */
  internalServerError(): Response {
    return this.jsonResponse(500, "Internal server error");
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

  private messageResponse(status: number, message: string): Response {
    return Response.json(
      { Message: message },
      { status, headers: { "content-type": "application/json" } },
    );
  }
}
