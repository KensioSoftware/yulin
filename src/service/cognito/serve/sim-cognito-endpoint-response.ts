/**
 * The responses a simulated user pool's public endpoints answer with.
 *
 * Both endpoints serve JSON, so a refusal is JSON too, carrying the `message`
 * a Cognito error carries.
 */
export class SimCognitoEndpointResponse {
  /**
   * Serve a document the pool publishes.
   */
  document(body: object): Response {
    return Response.json(body);
  }

  /**
   * Refuse a pool id this endpoint has no pool for.
   */
  noSuchUserPool(userPoolId: string): Response {
    return Response.json(
      { message: `User pool ${userPoolId} does not exist.` },
      { status: 404 },
    );
  }

  /**
   * Refuse a path that is neither of the two public endpoints.
   */
  noSuchEndpoint(pathname: string): Response {
    return Response.json(
      { message: `No simulated Cognito endpoint at ${pathname}` },
      { status: 404 },
    );
  }
}
