import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";

const password = "Sup3rSecret!";

interface SimCognitoSignedIn {
  readonly simAws: SimAws;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly accessToken: string;
  readonly idToken: string;
}

/**
 * A pool with a confirmed user signed in through the admin flow.
 *
 * A test that cares when the sign-in happened passes the instant to hold the
 * simulation's clock at while the tokens are issued.
 */
async function simCognitoSignedIn(
  signedInAt?: Date,
): Promise<SimCognitoSignedIn> {
  const simAws = new SimAws({
    defaultAccountId: "111111111111" as SimAwsAccountId,
    defaultRegionName: "eu-west-2",
  });
  const cognito = simAws.cognitoIdentityProvider();

  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const userPoolId = pool.UserPool.Id;
  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "web",
      ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
    }),
  );

  assertNonNullable(client.UserPoolClient?.ClientId);

  const clientId = client.UserPoolClient.ClientId;

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
    }),
  );
  await cognito.adminSetUserPassword(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      Password: password,
      Permanent: true,
    }),
  );

  if (signedInAt !== undefined) {
    await simAws.clock().setTo(signedInAt);
  }

  const signedIn = await cognito.adminInitiateAuth(
    new AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: "alice", PASSWORD: password },
    }),
  );

  assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  assertNonNullable(signedIn.AuthenticationResult.IdToken);

  return {
    simAws,
    userPoolId,
    clientId,
    accessToken: signedIn.AuthenticationResult.AccessToken,
    idToken: signedIn.AuthenticationResult.IdToken,
  };
}

describe("sim Cognito token verification", () => {
  it("verifies an access token with aws-jwt-verify and no network", async () => {
    // Given a signed-in user, and a verifier configured for the pool.
    const { simAws, userPoolId, clientId, accessToken } =
      await simCognitoSignedIn();
    const verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: "access",
      clientId,
    });

    verifier.cacheJwks(
      simAws.cognitoIdentityProvider().userPool(userPoolId).jwks(),
    );

    // When the verifier verifies the token it was given.
    const payload = await verifier.verify(accessToken);

    // Then it passes, having checked the signature, the issuer and the claims
    // rather than having been stubbed.
    assertIdentical(payload.username, "alice");
    assertIdentical(payload.token_use, "access");
    assertIdentical(payload.client_id, clientId);
  });

  it("verifies an id token for the same user", async () => {
    // Given a signed-in user, and a verifier for id tokens.
    const { simAws, userPoolId, clientId, idToken } =
      await simCognitoSignedIn();
    const verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: "id",
      clientId,
    });

    verifier.cacheJwks(
      simAws.cognitoIdentityProvider().userPool(userPoolId).jwks(),
    );

    // When the id token is verified.
    const payload = await verifier.verify(idToken);

    // Then the audience is the app client, and the user's attributes are on
    // it, as they are on a real id token.
    assertIdentical(payload.aud, clientId);
    assertIdentical(payload["cognito:username"], "alice");
    assertIdentical(payload["email"], "alice@example.com");
  });

  it("refuses an access token where an id token belongs", async () => {
    // Given a signed-in user, and a verifier expecting an id token.
    const { simAws, userPoolId, clientId, accessToken } =
      await simCognitoSignedIn();
    const verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: "id",
      clientId,
    });

    verifier.cacheJwks(
      simAws.cognitoIdentityProvider().userPool(userPoolId).jwks(),
    );

    // When the access token is verified as an id token.
    const error = await assertThrowsErrorAsync(async () => {
      await verifier.verify(accessToken);
    });

    // Then the verifier refuses it, because the claim split here is the real
    // one: code reading the wrong token fails as it would in production.
    assertStringIncludes(error.message, "Token use not allowed");
  });

  it("stamps a token with the time the simulation signed the user in", async () => {
    // Given a simulation whose clock is held still, and a user signed in then.
    const signedInAt = new Date();

    signedInAt.setMilliseconds(0);

    const { simAws, userPoolId, clientId, accessToken } =
      await simCognitoSignedIn(signedInAt);
    const verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: "access",
      clientId,
    });

    verifier.cacheJwks(
      simAws.cognitoIdentityProvider().userPool(userPoolId).jwks(),
    );

    // When the token is verified.
    const payload = await verifier.verify(accessToken);

    // Then its timestamps came from the simulation's clock rather than from
    // the host's, and it lasts the hour a pool's tokens last by default.
    const issuedAtSeconds = Math.floor(signedInAt.getTime() / 1000);

    assertIdentical(payload.iat, issuedAtSeconds);
    assertIdentical(payload.auth_time, issuedAtSeconds);
    assertIdentical(payload.exp, issuedAtSeconds + 3600);
  });

  it("issues an expired token when the simulation signs in far enough in the past", async () => {
    // Given a user signed in two hours ago in simulated time.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { simAws, userPoolId, clientId, accessToken } =
      await simCognitoSignedIn(twoHoursAgo);
    const verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: "access",
      clientId,
    });

    verifier.cacheJwks(
      simAws.cognitoIdentityProvider().userPool(userPoolId).jwks(),
    );

    // When that token is verified now.
    const error = await assertThrowsErrorAsync(async () => {
      await verifier.verify(accessToken);
    });

    // Then it is refused as expired, which is how a test exercises the expiry
    // handling in its own code without waiting an hour for it.
    assertStringIncludes(error.message, "expired");
  });
});
