import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { type Jwks, SimpleJwksCache } from "aws-jwt-verify/jwk";
import { describe, it } from "vitest";

import { serveSimAws } from "../../../serve/index.js";
import type { SimAwsLocalServer } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";

/**
 * A pool, an app client, and an access token for a user of it.
 */
interface SignedInPool {
  readonly userPoolId: string;
  readonly clientId: string;
  readonly accessToken: string;
}

async function signInToNewPool(simAws: SimAws): Promise<SignedInPool> {
  const cognito = simAws.cognitoIdentityProvider();

  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );
  assertNonNullable(pool.UserPool?.Id);
  const userPoolId = pool.UserPool.Id;

  const appClient = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "web",
      ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
    }),
  );
  assertNonNullable(appClient.UserPoolClient?.ClientId);
  const clientId = appClient.UserPoolClient.ClientId;

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
  );
  await cognito.adminSetUserPassword(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      Password: "Sup3rSecret!",
      Permanent: true,
    }),
  );

  const { AuthenticationResult: result } = await cognito.adminInitiateAuth(
    new AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
    }),
  );
  assertNonNullable(result?.AccessToken);

  return { userPoolId, clientId, accessToken: result.AccessToken };
}

/**
 * The URL a pool's JWKS is served at on a local server.
 */
function jwksUrl(srv: SimAwsLocalServer, userPoolId: string): URL {
  return srv.localUrl(
    `https://cognito-idp.eu-west-2.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
  );
}

describe("Serving a sim Cognito JWKS on localhost", () => {
  it("verifies a token with a JWKS fetched over real localhost HTTP", async () => {
    // Given a simulated user pool with a signed-in user, served on localhost.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const { userPoolId, clientId, accessToken } = await signInToNewPool(simAws);
    const srv = await serveSimAws({ simAws });

    try {
      // When the pool's JWKS is fetched from the served endpoint.
      const response = await fetch(jwksUrl(srv, userPoolId));
      const jwks = (await response.json()) as Jwks;

      // And the verifier the application uses is given those keys.
      const verifier = CognitoJwtVerifier.create({
        userPoolId,
        tokenUse: "access",
        clientId,
      });
      verifier.cacheJwks(jwks);

      // Then the token the simulator issued verifies against them.
      const payload = await verifier.verify(accessToken);
      assertIdentical(payload.username, "alice");
    } finally {
      await srv.close();
    }
  });

  it("lets a verifier fetch the JWKS for itself", async () => {
    // Given a simulated user pool with a signed-in user, served on localhost.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const { userPoolId, clientId, accessToken } = await signInToNewPool(simAws);
    const srv = await serveSimAws({ simAws });

    try {
      // When a verifier configured with nothing but the pool it trusts fetches
      // its own keys, through a cache that sends the AWS URL it builds to the
      // local server. aws-jwt-verify fetches over HTTPS only, so this is what
      // stands in for the network rather than a change to the verifier setup.
      const verifier = CognitoJwtVerifier.create(
        { userPoolId, tokenUse: "access", clientId },
        {
          jwksCache: new SimpleJwksCache({
            fetcher: {
              fetch: async (uri: string): Promise<ArrayBuffer> => {
                const served = await fetch(srv.localUrl(uri));
                return served.arrayBuffer();
              },
            },
          }),
        },
      );

      // Then the token verifies against keys the verifier went and got.
      const payload = await verifier.verify(accessToken);
      assertIdentical(payload.username, "alice");
    } finally {
      await srv.close();
    }
  });

  it("serves an OpenID configuration pointing at the served JWKS", async () => {
    // Given a simulated user pool served on localhost.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const pool = await simAws
      .cognitoIdentityProvider()
      .createUserPool(new CreateUserPoolCommand({ PoolName: "myapp-users" }));
    assertNonNullable(pool.UserPool?.Id);
    const srv = await serveSimAws({ simAws });

    try {
      // When the OpenID configuration is fetched over localhost.
      const response = await fetch(
        srv.localUrl(
          `https://cognito-idp.eu-west-2.amazonaws.com/${pool.UserPool.Id}/.well-known/openid-configuration`,
        ),
      );
      const document = (await response.json()) as {
        jwks_uri: string;
      };

      // Then the JWKS URI it advertises is one that answers.
      assertIdentical(response.status, 200);
      const jwks = await fetch(document.jwks_uri);
      assertIdentical(jwks.status, 200);
    } finally {
      await srv.close();
    }
  });
});
