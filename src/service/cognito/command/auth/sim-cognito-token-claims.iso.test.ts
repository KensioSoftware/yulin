import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateGroupCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertNotEqual,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { JSONObject } from "../../../../util/type-guard/json.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

const password = "Sup3rSecret!";

interface SimCognitoTokens {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly accessToken: string;
  readonly idToken: string;
}

/**
 * Read one part of a JWT, which is base64url encoded JSON.
 */
function decodePart(part: string | undefined): JSONObject {
  return JSON.parse(
    Buffer.from(part ?? "", "base64url").toString("utf8"),
  ) as JSONObject;
}

function tokenHeader(token: string): JSONObject {
  const [header] = token.split(".", 1);

  return decodePart(header);
}

function tokenClaims(token: string): JSONObject {
  const [, claims] = token.split(".", 2);

  return decodePart(claims);
}

/**
 * A user in two groups, signed in.
 */
async function simCognitoTokens(): Promise<SimCognitoTokens> {
  const cognito = new SimAws({
    defaultAccountId: "111111111111",
    defaultRegionName: "eu-west-2",
  }).cognitoIdentityProvider();

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
    new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
  );
  await cognito.adminSetUserPassword(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      Password: password,
      Permanent: true,
    }),
  );

  await cognito.createGroup(
    new CreateGroupCommand({
      UserPoolId: userPoolId,
      GroupName: "readers",
      Precedence: 10,
    }),
  );
  await cognito.createGroup(
    new CreateGroupCommand({
      UserPoolId: userPoolId,
      GroupName: "admins",
      Precedence: 1,
    }),
  );
  await cognito.adminAddUserToGroup(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      GroupName: "readers",
    }),
  );
  await cognito.adminAddUserToGroup(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      GroupName: "admins",
    }),
  );

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
    cognito,
    userPoolId,
    clientId,
    accessToken: signedIn.AuthenticationResult.AccessToken,
    idToken: signedIn.AuthenticationResult.IdToken,
  };
}

describe("sim Cognito token claims", () => {
  it("signs with RS256 and a key the pool publishes", async () => {
    // Given a signed-in user.
    const { cognito, userPoolId, accessToken } = await simCognitoTokens();

    // When the token's header is read.
    const header = tokenHeader(accessToken);

    // Then it names RS256 and a key id the pool's JWKS holds.
    const [key] = cognito.userPool(userPoolId).jwks().keys;

    assertNonNullable(key);
    assertIdentical(header["alg"], "RS256");
    assertIdentical(header["kid"], key.kid);
    assertIdentical(key.kty, "RSA");
    assertIdentical(key.use, "sig");
  });

  it("gives each pool its own key", async () => {
    // Given two pools in one simulation.
    const cognito = new SimAws().cognitoIdentityProvider();
    const first = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "first" }),
    );
    const second = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "second" }),
    );

    assertNonNullable(first.UserPool?.Id);
    assertNonNullable(second.UserPool?.Id);

    // When each publishes its JWKS.
    const [firstKey] = cognito.userPool(first.UserPool.Id).jwks().keys;
    const [secondKey] = cognito.userPool(second.UserPool.Id).jwks().keys;

    // Then the keys are different, as they are on two real pools, and each
    // pool keeps the one it generated.
    assertNonNullable(firstKey);
    assertNonNullable(secondKey);
    assertNotEqual(firstKey.kid, secondKey.kid);
    assertIdentical(
      cognito.userPool(first.UserPool.Id).jwks().keys[0]?.kid,
      firstKey.kid,
    );
  });

  it("names the pool as the issuer", async () => {
    // Given a signed-in user.
    const { userPoolId, accessToken, idToken } = await simCognitoTokens();

    // When each token's issuer is read.
    const accessClaims = tokenClaims(accessToken);
    const idClaims = tokenClaims(idToken);

    // Then both name the pool's own issuer URL, which is where a verifier
    // looks the keys up.
    const issuer = `https://cognito-idp.eu-west-2.amazonaws.com/${userPoolId}`;

    assertIdentical(accessClaims["iss"], issuer);
    assertIdentical(idClaims["iss"], issuer);
  });

  it("splits the claims between the two tokens the way Cognito does", async () => {
    // Given a signed-in user.
    const { clientId, accessToken, idToken } = await simCognitoTokens();

    // When both sets of claims are read.
    const accessClaims = tokenClaims(accessToken);
    const idClaims = tokenClaims(idToken);

    // Then the id token names its audience and the access token names its
    // client, and neither carries the other's claim.
    assertIdentical(idClaims["aud"], clientId);
    assertIdentical(idClaims["token_use"], "id");
    assertIdentical(idClaims["cognito:username"], "alice");
    assertUndefined(idClaims["client_id"]);

    assertIdentical(accessClaims["client_id"], clientId);
    assertIdentical(accessClaims["token_use"], "access");
    assertIdentical(accessClaims["username"], "alice");
    assertIdentical(accessClaims["scope"], "aws.cognito.signin.user.admin");
    assertUndefined(accessClaims["aud"]);
  });

  it("carries the same user and groups on both tokens", async () => {
    // Given a signed-in user in two groups.
    const { accessToken, idToken } = await simCognitoTokens();

    // When both sets of claims are read.
    const accessClaims = tokenClaims(accessToken);
    const idClaims = tokenClaims(idToken);

    // Then the sub is the same on both, and the groups are on both in
    // precedence order.
    assertTypeString(accessClaims["sub"]);
    assertIdentical(accessClaims["sub"], idClaims["sub"]);
    assertArrayEquals(accessClaims["cognito:groups"], ["admins", "readers"]);
    assertArrayEquals(idClaims["cognito:groups"], ["admins", "readers"]);
  });

  it("leaves the group claim out for a user in no groups", async () => {
    // Given a pool with a user in no groups.
    const cognito = new SimAws().cognitoIdentityProvider();
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

    await cognito.adminCreateUser(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "bob" }),
    );
    await cognito.adminSetUserPassword(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: "bob",
        Password: password,
        Permanent: true,
      }),
    );

    // When that user signs in.
    const signedIn = await cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: client.UserPoolClient?.ClientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "bob", PASSWORD: password },
      }),
    );

    // Then there is no group claim at all, rather than an empty list, which
    // is what real Cognito leaves out.
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
    assertUndefined(
      tokenClaims(signedIn.AuthenticationResult.AccessToken)["cognito:groups"],
    );
  });
});
