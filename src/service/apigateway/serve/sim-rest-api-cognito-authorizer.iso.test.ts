import {
  assertIdentical,
  assertObjectMatches,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload1Event } from "../../../serve/payload-1/sim-payload-1-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import {
  type SimCognitoSignedIn,
  simCognitoSignedInFactory,
} from "../../cognito/user-pool/auth/sim-cognito-signed-in.factory.js";
import { simRestApiLambdaProxyFactory } from "../api/sim-rest-api-lambda-proxy.factory.js";
import type { SimRestApi } from "../api/sim-rest-api.js";

/**
 * The scope a Cognito sign-in through the user pool API puts in a token.
 */
const adminScope = "aws.cognito.signin.user.admin";

/**
 * A handler reporting what the authorizer told it about the caller, so a test
 * can assert on the claims rather than only on the status.
 */
const claimsHandler = (event: SimPayload1Event): unknown => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(event.requestContext.authorizer ?? null),
});

interface GatedApi {
  readonly simAws: SimAws;
  readonly restApi: SimRestApi;
  readonly signedIn: SimCognitoSignedIn;
}

/**
 * A pool with a signed-in user, and an API whose one method is gated by a
 * Cognito authorizer naming that pool.
 */
async function gatedApi(
  authorizationScopes: readonly string[] = [],
): Promise<GatedApi> {
  const simAws = new SimAws();
  const signedIn = await simCognitoSignedInFactory.make({}, simAws);
  const restApi = await simRestApiLambdaProxyFactory.make(
    {
      handler: claimsHandler,
      resourcePaths: ["/orders"],
      httpMethod: "GET",
      cognitoUserPoolArns: [signedIn.userPoolArn],
      authorizationScopes,
    },
    simAws,
  );

  return { simAws, restApi, signedIn };
}

function get(
  simAws: SimAws,
  restApi: SimRestApi,
  headers: Record<string, string> = {},
): Promise<Response> {
  return new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({
      input: `${restApi.invokeUrl("prod")}/orders`,
    }).toString(),
    { headers },
  );
}

describe("Authorizing a sim REST API method with a Cognito authorizer", () => {
  it("lets a signed-in user's access token through to the handler", async () => {
    // Given a gated method and a token from a simulated Cognito sign-in
    const { simAws, restApi, signedIn } = await gatedApi();

    // When the method is called with that token
    const response = await get(simAws, restApi, {
      authorization: signedIn.accessToken,
    });

    // Then the handler ran, and the token's own claims reached it under
    // `claims`, which is where a REST API puts them
    assertResponseStatus(response, 200, await describeResponse(response));
    assertObjectMatches(await response.json(), {
      claims: {
        client_id: signedIn.clientId,
        iss: signedIn.issuerUrl,
        token_use: "access",
        username: signedIn.username,
      },
    });
  });

  it("takes an id token, and renders a list claim as API Gateway does", async () => {
    // Given a signed-in user who belongs to two groups
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make(
      { groupNames: ["Admins", "Readers"] },
      simAws,
    );
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        handler: claimsHandler,
        resourcePaths: ["/orders"],
        httpMethod: "GET",
        cognitoUserPoolArns: [signedIn.userPoolArn],
      },
      simAws,
    );

    // When the method is called with their id token
    const response = await get(simAws, restApi, {
      authorization: signedIn.idToken,
    });

    // Then it is accepted, since a method asking for no scope tells the two
    // token types apart by nothing, and the groups arrive as one string,
    // rendered the way Go prints a slice
    assertResponseStatus(response, 200, await describeResponse(response));
    assertObjectMatches(await response.json(), {
      claims: { token_use: "id", "cognito:groups": "[Admins Readers]" },
    });
  });

  it("takes the token with or without the Bearer prefix", async () => {
    // Given a gated method
    const { simAws, restApi, signedIn } = await gatedApi();

    // When the token is sent under the scheme, in two cases of it
    const upperCase = await get(simAws, restApi, {
      authorization: `Bearer ${signedIn.accessToken}`,
    });
    const lowerCase = await get(simAws, restApi, {
      authorization: `bearer ${signedIn.accessToken}`,
    });

    // Then both are read, since API Gateway strips the scheme rather than
    // requiring it
    assertResponseStatus(upperCase, 200, await describeResponse(upperCase));
    assertResponseStatus(lowerCase, 200, await describeResponse(lowerCase));
  });

  it("refuses a request carrying no token", async () => {
    // Given a gated method
    const { simAws, restApi } = await gatedApi();

    // When it is called with nothing in the identity source
    const response = await get(simAws, restApi);

    // Then the request is refused, and the handler never ran
    assertResponseStatus(response, 401, await describeResponse(response));
    assertIdentical(await response.text(), '{"message":"Unauthorized"}');
  });

  it("refuses a header that is not a readable JWT", async () => {
    // Given a gated method
    const { simAws, restApi } = await gatedApi();

    // When something that is not a token is presented
    const response = await get(simAws, restApi, {
      authorization: "Bearer not-a-token",
    });

    // Then it is refused the same way a missing token is, so a client learns
    // nothing about which check it failed
    assertResponseStatus(response, 401, await describeResponse(response));
    assertIdentical(await response.text(), '{"message":"Unauthorized"}');
  });

  it("refuses a token no named pool issued", async () => {
    // Given a gated method and a token from a pool it does not name
    const { simAws, restApi } = await gatedApi();
    const otherPool = await simCognitoSignedInFactory.make(
      { poolName: "other-users" },
      simAws,
    );

    // When that token is presented
    const response = await get(simAws, restApi, {
      authorization: otherPool.accessToken,
    });

    // Then it is refused: it is signed by a key no named pool published, and
    // it names another issuer
    assertResponseStatus(response, 401, await describeResponse(response));
  });

  it("refuses a token signed by a key the pool never published", async () => {
    // Given a gated method and a token the same pool would not have signed
    const { simAws, restApi, signedIn } = await gatedApi();
    const forged = await simCognitoSignedInFactory.make(
      { poolName: "forgers" },
      simAws,
    );
    const [header, , signature] = forged.accessToken.split(".", 3);
    const [, claims] = signedIn.accessToken.split(".", 2);

    // When it carries the accepted pool's claims under another pool's key
    const response = await get(simAws, restApi, {
      authorization: `${header}.${claims}.${signature}`,
    });

    // Then it is refused, because the signature is checked rather than read
    assertResponseStatus(response, 401, await describeResponse(response));
  });

  it("expires an already-issued token when the clock advances", async () => {
    // Given a gated method and a token that works
    const { simAws, restApi, signedIn } = await gatedApi();
    const accepted = await get(simAws, restApi, {
      authorization: signedIn.accessToken,
    });

    // When simulated time passes the token's expiry, with nothing reissued
    await simAws.clock().advanceBy({ hours: 2 });

    // Then the same token is refused
    const expired = await get(simAws, restApi, {
      authorization: signedIn.accessToken,
    });
    assertResponseStatus(accepted, 200, await describeResponse(accepted));
    assertResponseStatus(expired, 401, await describeResponse(expired));
  });

  it("lets a token through that claims a scope the method asks for", async () => {
    // Given a method asking for the scope a pool sign-in issues
    const { simAws, restApi, signedIn } = await gatedApi([adminScope]);

    // When an access token carrying that scope is presented
    const response = await get(simAws, restApi, {
      authorization: signedIn.accessToken,
    });

    // Then the method is reached, because one method scope matched
    assertResponseStatus(response, 200, await describeResponse(response));
  });

  it("refuses a verified token claiming none of the method's scopes", async () => {
    // Given a method asking for a scope no simulated flow issues
    const { simAws, restApi, signedIn } = await gatedApi(["orders.write"]);

    // When an accepted access token is presented
    const response = await get(simAws, restApi, {
      authorization: signedIn.accessToken,
    });

    // Then the answer is 403 rather than 401: the token was accepted, and it
    // does not allow this method
    assertResponseStatus(response, 403, await describeResponse(response));
    assertObjectMatches(await response.json(), {
      Message: "User is not authorized to access this resource",
    });
  });

  it("refuses an id token on a method that asks for a scope", async () => {
    // Given a method asking for the access token's scope
    const { simAws, restApi, signedIn } = await gatedApi([adminScope]);

    // When the id token is presented
    const response = await get(simAws, restApi, {
      authorization: signedIn.idToken,
    });

    // Then it is refused, because an id token carries no scope claim at all.
    // Method scopes are the only thing that tells the two token types apart.
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("refuses every request once the method's authorizer is deleted", async () => {
    // Given a gated method whose authorizer is then deleted
    const { simAws, restApi, signedIn } = await gatedApi();
    const [authorizer] = restApi.authorizers.list();
    await simAws.apiGateway().deleteAuthorizer({
      input: {
        restApiId: restApi.apiId,
        authorizerId: authorizer?.authorizerId,
      },
    });

    // When a token that worked before is presented
    const response = await get(simAws, restApi, {
      authorization: signedIn.accessToken,
    });

    // Then the method stays closed rather than falling open, since there is
    // nothing left to verify the token against
    assertResponseStatus(response, 401, await describeResponse(response));
  });

  it("refuses every token when the named pool is gone", async () => {
    // Given a gated method whose pool is deleted out from under it
    const { simAws, restApi, signedIn } = await gatedApi();
    await simAws.cognitoIdentityProvider().deleteUserPool({
      input: { UserPoolId: signedIn.userPoolId },
    });

    // When a token that pool issued is presented
    const response = await get(simAws, restApi, {
      authorization: signedIn.accessToken,
    });

    // Then it is refused, because a pool that is gone publishes nothing to
    // check the signature against
    assertResponseStatus(response, 401, await describeResponse(response));
  });

  it("admits a token from any one of the pools the authorizer names", async () => {
    // Given a method naming two pools, and a user signed in to the second
    const simAws = new SimAws();
    const first = await simCognitoSignedInFactory.make(
      { poolName: "staff" },
      simAws,
    );
    const second = await simCognitoSignedInFactory.make(
      { poolName: "customers", username: "grace" },
      simAws,
    );
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        handler: claimsHandler,
        resourcePaths: ["/orders"],
        httpMethod: "GET",
        cognitoUserPoolArns: [first.userPoolArn, second.userPoolArn],
      },
      simAws,
    );

    // When that user's token is presented
    const response = await get(simAws, restApi, {
      authorization: second.accessToken,
    });

    // Then it is admitted, since any one of the named pools is enough
    assertResponseStatus(response, 200, await describeResponse(response));
    assertObjectMatches(await response.json(), {
      claims: { iss: second.issuerUrl, username: "grace" },
    });
  });
});
