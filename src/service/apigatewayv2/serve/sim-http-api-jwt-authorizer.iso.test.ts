/* eslint-disable @typescript-eslint/naming-convention -- JWT claim names are
   the ones RFC 7519 and Cognito define, rather than identifier names. */
import { assertIdentical, assertObjectMatches } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import {
  type SimCognitoSignedIn,
  simCognitoSignedInFactory,
} from "../../cognito/user-pool/auth/sim-cognito-signed-in.factory.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";

/**
 * The scope a Cognito sign-in through the user pool API puts in a token.
 */
const adminScope = "aws.cognito.signin.user.admin";

/**
 * A handler reporting what the authorizer told it about the caller, so a test
 * can assert on the claims rather than only on the status.
 */
function claimsHandler(): (event: {
  requestContext: { authorizer?: { jwt?: unknown } };
}) => unknown {
  return (event) => ({
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event.requestContext.authorizer?.jwt ?? null),
  });
}

interface ProtectedApi {
  readonly simAws: SimAws;
  readonly api: SimHttpApi;
  readonly signedIn: SimCognitoSignedIn;
}

/**
 * A pool with a signed-in user, and an API whose one route is protected by a
 * JWT authorizer trusting that pool.
 */
async function protectedApi(
  authorizationScopes: readonly string[] = [],
): Promise<ProtectedApi> {
  const simAws = new SimAws();
  const signedIn = await simCognitoSignedInFactory.make({}, simAws);
  const api = await simHttpApiLambdaProxyFactory.make(
    {
      handler: claimsHandler(),
      authorizationScopes,
      jwtAuthorizer: {
        issuer: signedIn.issuerUrl,
        audience: [signedIn.clientId],
        identitySource: "$request.header.Authorization",
      },
    },
    simAws,
  );

  return { simAws, api, signedIn };
}

function get(
  simAws: SimAws,
  api: SimHttpApi,
  headers: Record<string, string> = {},
): Promise<Response> {
  return new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({ input: `${api.apiEndpoint}/orders` }).toString(),
    { headers },
  );
}

describe("Authorizing a sim HTTP API route with a JWT authorizer", () => {
  it("lets a signed-in user's access token through to the handler", async () => {
    // Given a protected route and a token from a simulated Cognito sign-in
    const { simAws, api, signedIn } = await protectedApi();

    // When the route is called with that token
    const response = await get(simAws, api, {
      authorization: `Bearer ${signedIn.accessToken}`,
    });

    // Then the handler ran, and it saw the claims the authorizer accepted
    assertIdentical(response.status, 200);
    assertObjectMatches(await response.json(), {
      claims: {
        client_id: signedIn.clientId,
        iss: signedIn.issuerUrl,
        token_use: "access",
        username: signedIn.username,
      },
      scopes: [adminScope],
    });
  });

  it("renders a list claim the way real API Gateway renders it", async () => {
    // Given a signed-in user who belongs to two groups
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make(
      { groupNames: ["Admins", "Readers"] },
      simAws,
    );
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: claimsHandler(),
        jwtAuthorizer: {
          issuer: signedIn.issuerUrl,
          audience: [signedIn.clientId],
          identitySource: "$request.header.Authorization",
        },
      },
      simAws,
    );

    // When the route is called with their access token
    const response = await get(simAws, api, {
      authorization: `Bearer ${signedIn.accessToken}`,
    });

    // Then the groups arrive as one string, rendered the way Go prints a
    // slice rather than as JSON or as a comma-separated list
    assertObjectMatches(await response.json(), {
      claims: { "cognito:groups": "[Admins Readers]" },
    });
  });

  it("takes the token with or without the Bearer prefix", async () => {
    // Given a protected route
    const { simAws, api, signedIn } = await protectedApi();

    // When the token is sent bare, and with the scheme in another case
    const bare = await get(simAws, api, {
      authorization: signedIn.accessToken,
    });
    const lowerCase = await get(simAws, api, {
      authorization: `bearer ${signedIn.accessToken}`,
    });

    // Then both are read, since API Gateway strips the scheme rather than
    // requiring it
    assertIdentical(bare.status, 200);
    assertIdentical(lowerCase.status, 200);
  });

  it("refuses a request carrying no token", async () => {
    // Given a protected route
    const { simAws, api } = await protectedApi();

    // When it is called with nothing in the identity source
    const response = await get(simAws, api);

    // Then the request is refused, and the handler never ran
    assertIdentical(response.status, 401);
    assertIdentical(response.headers.get("www-authenticate"), "Bearer");
    assertIdentical(await response.text(), '{"message":"Unauthorized"}');
  });

  it("refuses a token that is not a JWT at all", async () => {
    // Given a protected route
    const { simAws, api } = await protectedApi();

    // When something that is not a token is presented
    const response = await get(simAws, api, {
      authorization: "Bearer not-a-token",
    });

    // Then it is refused the same way a missing token is, so a client learns
    // nothing about which check it failed
    assertIdentical(response.status, 401);
    assertIdentical(await response.text(), '{"message":"Unauthorized"}');
  });

  it("refuses a token another pool signed", async () => {
    // Given a protected route and a token from a different pool
    const { simAws, api } = await protectedApi();
    const otherPool = await simCognitoSignedInFactory.make(
      { poolName: "other-users" },
      simAws,
    );

    // When that token is presented
    const response = await get(simAws, api, {
      authorization: `Bearer ${otherPool.accessToken}`,
    });

    // Then it is refused: it is signed by a key the configured issuer never
    // published, and it names another issuer
    assertIdentical(response.status, 401);
  });

  it("refuses a token whose audience is not one the authorizer accepts", async () => {
    // Given a pool with two app clients, and a route accepting only the first
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: claimsHandler(),
        jwtAuthorizer: {
          issuer: signedIn.issuerUrl,
          audience: ["another-client-id"],
          identitySource: "$request.header.Authorization",
        },
      },
      simAws,
    );

    // When a token for the other client is presented
    const response = await get(simAws, api, {
      authorization: `Bearer ${signedIn.accessToken}`,
    });

    // Then it is refused, with the one description AWS publishes
    assertIdentical(response.status, 401);
    assertIdentical(
      response.headers.get("www-authenticate"),
      'Bearer error="invalid_token", ' +
        'error_description="the token does not have a valid audience"',
    );
  });

  it("expires an already-issued token when the clock advances", async () => {
    // Given a protected route and a token that works
    const { simAws, api, signedIn } = await protectedApi();
    const accepted = await get(simAws, api, {
      authorization: `Bearer ${signedIn.accessToken}`,
    });

    // When simulated time passes the token's expiry, with nothing reissued
    await simAws.clock().advanceBy({ hours: 2 });

    // Then the same token is refused
    const refused = await get(simAws, api, {
      authorization: `Bearer ${signedIn.accessToken}`,
    });
    assertIdentical(accepted.status, 200);
    assertIdentical(refused.status, 401);
  });

  it("lets a token through that claims a scope the route asks for", async () => {
    // Given a route asking for the scope a pool sign-in issues
    const { simAws, api, signedIn } = await protectedApi([adminScope]);

    // When an access token carrying that scope is presented
    const response = await get(simAws, api, {
      authorization: `Bearer ${signedIn.accessToken}`,
    });

    // Then the route is reached, because one route scope matched
    assertIdentical(response.status, 200);
  });

  it("refuses a verified token that claims none of the route's scopes", async () => {
    // Given a route asking for a scope no simulated flow issues
    const { simAws, api, signedIn } = await protectedApi(["orders.write"]);

    // When an accepted access token is presented
    const response = await get(simAws, api, {
      authorization: `Bearer ${signedIn.accessToken}`,
    });

    // Then the answer is 403 rather than 401: the token was accepted, and it
    // does not allow this route
    assertIdentical(response.status, 403);
    assertIdentical(await response.text(), '{"message":"Forbidden"}');
  });

  it("takes an id token through an authorizer that only configures audience", async () => {
    // Given a protected route and the id token from the same sign-in
    const { simAws, api, signedIn } = await protectedApi();

    // When the id token is presented instead of the access token
    const response = await get(simAws, api, {
      authorization: `Bearer ${signedIn.idToken}`,
    });

    // Then it is accepted, because `token_use` is not checked, which is what
    // real API Gateway does. Its `aud` is the app client id, so it matches.
    assertIdentical(response.status, 200);
    assertObjectMatches(await response.json(), {
      claims: { aud: signedIn.clientId, token_use: "id" },
      scopes: null,
    });
  });

  it("refuses an id token on a route that asks for a scope", async () => {
    // Given a route asking for the access token's scope
    const { simAws, api, signedIn } = await protectedApi([adminScope]);

    // When the id token is presented
    const response = await get(simAws, api, {
      authorization: `Bearer ${signedIn.idToken}`,
    });

    // Then it is refused, because an id token carries no scope claim at all.
    // Route scopes are the only thing that tells the two token types apart.
    assertIdentical(response.status, 403);
  });

  it("still accepts a token the pool was told to sign out", async () => {
    // Given a protected route and a signed-in user
    const { simAws, api, signedIn } = await protectedApi();

    // When the user is signed out everywhere and presents the same token
    await simAws.cognitoIdentityProvider().adminUserGlobalSignOut({
      input: {
        UserPoolId: signedIn.userPoolId,
        Username: signedIn.username,
      },
    });
    const response = await get(simAws, api, {
      authorization: `Bearer ${signedIn.accessToken}`,
    });

    // Then it is still accepted, because real API Gateway knows nothing about
    // the pool's issued-token store and cannot see a revocation
    assertIdentical(response.status, 200);
  });

  it("refuses every request once the route's authorizer is deleted", async () => {
    // Given a protected route whose authorizer is then deleted
    const { simAws, api, signedIn } = await protectedApi();
    const [authorizer] = api.authorizers.list();
    await simAws.apiGatewayV2().deleteAuthorizer({
      input: { ApiId: api.apiId, AuthorizerId: authorizer?.authorizerId },
    });

    // When a token that worked before is presented
    const response = await get(simAws, api, {
      authorization: `Bearer ${signedIn.accessToken}`,
    });

    // Then the route stays closed rather than falling open, since there is
    // nothing left to verify the token against
    assertIdentical(response.status, 401);
  });

  it("reads the token from a query string identity source", async () => {
    // Given a route whose authorizer looks in the query string
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: claimsHandler(),
        jwtAuthorizer: {
          issuer: signedIn.issuerUrl,
          audience: [signedIn.clientId],
          identitySource: "$request.querystring.access_token",
        },
      },
      simAws,
    );

    // When the token arrives there rather than in a header
    const response = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({
        input: `${api.apiEndpoint}/orders?access_token=${signedIn.accessToken}`,
      }).toString(),
    );

    // Then it is read from where the authorizer was told to look
    assertIdentical(response.status, 200);
  });

  it("leaves the authorizer block out of the event on an open route", async () => {
    // Given a route that admits anyone
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: claimsHandler() },
      simAws,
    );

    // When it is called
    const response = await get(simAws, api);

    // Then there is no caller to describe, so the event carries no authorizer
    // block at all
    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "null");
  });
});
