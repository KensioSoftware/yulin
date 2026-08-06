/**
 * The responses a simulated user pool's public endpoints answer with.
 *
 * Both endpoints serve JSON, so a refusal is JSON too, carrying the `message`
 * a Cognito error carries.
 */
export class SimCognitoEndpointResponse {
  /**
   * Serve a document the pool publishes.
   *
   * A HEAD asks for the headers a GET would answer with and no body, so the
   * document is measured rather than sent.
   */
  document(body: object, method: string): Response {
    const json = JSON.stringify(body);
    const headers = {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(json)),
    };

    if (method === "HEAD") {
      return new Response(undefined, { status: 200, headers });
    }

    return new Response(json, { status: 200, headers });
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
   * Refuse a method that does not read a published document.
   *
   * Every path here publishes a document, so `GET` and `HEAD` are all they
   * answer. The Cognito API is reached through `SimSdk` rather than by posting
   * to this hostname, so a `POST` here is not the API either.
   */
  notRead(method: string): Response {
    return Response.json(
      {
        message:
          `Simulated Cognito answers ${method} at no user pool endpoint. ` +
          `The JWKS, the OpenID configuration and the recorded messages are ` +
          `read with GET or HEAD.`,
      },
      { status: 405, headers: { allow: "GET, HEAD" } },
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
