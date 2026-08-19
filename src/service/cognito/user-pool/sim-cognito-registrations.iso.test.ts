import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeUserPoolClientCommand,
  DescribeUserPoolCommand,
  InitiateAuthCommand,
  ListUserPoolsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  SimCognitoInvalidParameterException,
  SimCognitoResourceNotFoundException,
  SimCognitoUserPoolAlreadyExists,
  SimCognitoUserPoolClientAlreadyExists,
} from "../error/sim-cognito.error.js";

// The ids a CDK app pins as literal strings, because the stack that creates the
// pool is not the stack that names it.
const pinnedUserPoolId = "eu-west-2_aBcDeFgHi";
const pinnedClientId = "examplewebclient0000000000";

const accountId = "111111111111";
const regionName = "eu-west-2";

/**
 * A simulated Cognito in the Region the pinned pool id names.
 */
function simCognito(): SimAws {
  return new SimAws({
    defaultAccountId: accountId,
    defaultRegionName: regionName,
  });
}

describe("Registering a simulated Cognito user pool", () => {
  it("answers DescribeUserPool under the registered pool id", async () => {
    // Given a simulated Cognito.
    const simAws = simCognito();
    const cognito = simAws.cognitoIdentityProvider();

    // When a user pool is registered with a chosen id.
    cognito.registerUserPool({
      id: pinnedUserPoolId,
      name: "myapp-users",
      settings: { DeletionProtection: "ACTIVE" },
    });

    // Then it is described under that id, with the settings it was registered
    // with.
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: pinnedUserPoolId }),
    );

    assertObjectMatches(described.UserPool, {
      Id: pinnedUserPoolId,
      Name: "myapp-users",
      DeletionProtection: "ACTIVE",
    });
  });

  it("gives the pool the ARN, issuer URL and provider name its id implies", () => {
    // Given a simulated Cognito.
    const simAws = simCognito();
    const cognito = simAws.cognitoIdentityProvider();

    // When a pool is registered.
    const pool = cognito.registerUserPool({
      id: pinnedUserPoolId,
      name: "myapp-users",
    });

    // Then everything a policy or a token verifier is written against follows
    // from the id it was registered under.
    assertIdentical(
      pool.arn.value,
      `arn:aws:cognito-idp:${regionName}:${accountId}:userpool/${pinnedUserPoolId}`,
    );
    assertIdentical(
      pool.issuerUrl,
      `https://cognito-idp.${regionName}.amazonaws.com/${pinnedUserPoolId}`,
    );
    assertIdentical(
      pool.providerName,
      `cognito-idp.${regionName}.amazonaws.com/${pinnedUserPoolId}`,
    );

    // And the pool is in the registry the served JWKS and OpenID documents are
    // resolved through, as a created pool is.
    const registered = cognito.findUserPoolInAnyAccount(pinnedUserPoolId);
    assertNonNullable(registered, "Registered pool in the simulation registry");
    assertObjectEquals(registered.jwks(), pool.jwks());
  });

  it("lists the registered pool like any other", async () => {
    // Given a simulated Cognito.
    const simAws = simCognito();
    const cognito = simAws.cognitoIdentityProvider();

    // When a pool is registered.
    cognito.registerUserPool({ id: pinnedUserPoolId, name: "myapp-users" });

    // Then ListUserPools answers with it.
    const listed = await cognito.listUserPools(
      new ListUserPoolsCommand({ MaxResults: 10 }),
    );

    assertArrayLength(listed.UserPools, 1);
    assertObjectMatches(listed.UserPools[0], {
      Id: pinnedUserPoolId,
      Name: "myapp-users",
    });
  });

  it("signs a user in through an app client registered under a chosen id", async () => {
    // Given a registered pool holding a user with a password.
    const simAws = simCognito();
    const cognito = simAws.cognitoIdentityProvider();

    cognito.registerUserPool({ id: pinnedUserPoolId, name: "myapp-users" });
    cognito.registerUserPoolClient({
      userPoolId: pinnedUserPoolId,
      id: pinnedClientId,
      name: "web",
      settings: { ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"] },
    });

    await cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: pinnedUserPoolId,
        Username: "alice",
      }),
    );
    await cognito.adminSetUserPassword(
      new AdminSetUserPasswordCommand({
        UserPoolId: pinnedUserPoolId,
        Username: "alice",
        Password: "Sup3rSecret!",
        Permanent: true,
      }),
    );

    // When the user signs in, naming the pinned client id and no pool at all.
    const signedIn = await cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: pinnedClientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
      }),
    );

    // Then the client id alone found the pool, and its token names the pool as
    // its issuer.
    const accessToken = signedIn.AuthenticationResult?.AccessToken;
    assertNonNullable(accessToken, "Access token from the registered client");

    const payload = String(accessToken.split(".", 2)[1]);
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      iss: string;
      client_id: string;
    };

    assertIdentical(
      claims.iss,
      `https://cognito-idp.${regionName}.amazonaws.com/${pinnedUserPoolId}`,
    );
    assertIdentical(claims.client_id, pinnedClientId);
  });

  it("describes the registered app client under the pool it was registered in", async () => {
    // Given a registered pool and app client.
    const simAws = simCognito();
    const cognito = simAws.cognitoIdentityProvider();

    cognito.registerUserPool({ id: pinnedUserPoolId, name: "myapp-users" });
    cognito.registerUserPoolClient({
      userPoolId: pinnedUserPoolId,
      id: pinnedClientId,
      name: "web",
      generateSecret: true,
      settings: {
        AllowedOAuthFlowsUserPoolClient: true,
        AllowedOAuthFlows: ["code"],
        AllowedOAuthScopes: ["openid"],
        CallbackURLs: ["https://app.example.test/signed-in"],
      },
    });

    // When the client is described.
    const described = await cognito.describeUserPoolClient(
      new DescribeUserPoolClientCommand({
        UserPoolId: pinnedUserPoolId,
        ClientId: pinnedClientId,
      }),
    );

    // Then it holds the id and the settings it was registered with, and the
    // secret it asked for.
    assertObjectMatches(described.UserPoolClient, {
      UserPoolId: pinnedUserPoolId,
      ClientId: pinnedClientId,
      ClientName: "web",
      CallbackURLs: ["https://app.example.test/signed-in"],
    });
    assertNonNullable(
      described.UserPoolClient.ClientSecret,
      "Registered client secret",
    );
  });

  it("refuses a pool id another registered pool holds", () => {
    // Given a registered pool.
    const simAws = simCognito();
    const cognito = simAws.cognitoIdentityProvider();

    cognito.registerUserPool({ id: pinnedUserPoolId, name: "myapp-users" });

    // When the same id is registered again.
    const error = assertThrowsError(() => {
      cognito.registerUserPool({ id: pinnedUserPoolId, name: "other-users" });
    });

    // Then the taken id is refused.
    assertInstanceOf(error, SimCognitoUserPoolAlreadyExists);
    assertStringIncludes(error.message, pinnedUserPoolId);
  });

  it("refuses a pool id a created pool already allocated", async () => {
    // Given a pool created through the Cognito API.
    const simAws = simCognito();
    const cognito = simAws.cognitoIdentityProvider();

    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "created-users" }),
    );
    const createdUserPoolId = created.UserPool?.Id;
    assertNonNullable(createdUserPoolId, "Created pool id");

    // When its allocated id is registered.
    const error = assertThrowsError(() => {
      cognito.registerUserPool({
        id: createdUserPoolId,
        name: "registered-users",
      });
    });

    // Then the taken id is refused.
    assertInstanceOf(error, SimCognitoUserPoolAlreadyExists);
    assertStringIncludes(error.message, createdUserPoolId);
  });

  it("refuses a pool id naming another Region", () => {
    // Given a simulated Cognito in eu-west-2.
    const simAws = simCognito();
    const cognito = simAws.cognitoIdentityProvider();

    // When a pool id from another Region is registered.
    const error = assertThrowsError(() => {
      cognito.registerUserPool({
        id: "us-east-1_aBcDeFgHi",
        name: "myapp-users",
      });
    });

    // Then it is refused, and the message says which Region to register it on.
    // A pool whose ARN and issuer URL named different Regions is one no real
    // pool matches.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "us-east-1");
    assertStringIncludes(error.message, regionName);
  });

  it("refuses a value that is no pool id at all", () => {
    // Given a simulated Cognito.
    const simAws = simCognito();
    const cognito = simAws.cognitoIdentityProvider();

    // When a malformed id is registered.
    const error = assertThrowsError(() => {
      cognito.registerUserPool({ id: "not-a-pool-id", name: "myapp-users" });
    });

    // Then it is refused as a bad parameter, as a request naming it would be.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "not-a-pool-id");
  });

  it("refuses a client id another pool in the simulation holds", () => {
    // Given a registered pool holding an app client.
    const simAws = simCognito();
    const cognito = simAws.cognitoIdentityProvider();

    cognito.registerUserPool({ id: pinnedUserPoolId, name: "myapp-users" });
    cognito.registerUserPoolClient({
      userPoolId: pinnedUserPoolId,
      id: pinnedClientId,
      name: "web",
    });

    // When the same client id is registered in a second pool.
    cognito.registerUserPool({
      id: "eu-west-2_jKlMnOpQr",
      name: "other-users",
    });

    const error = assertThrowsError(() => {
      cognito.registerUserPoolClient({
        userPoolId: "eu-west-2_jKlMnOpQr",
        id: pinnedClientId,
        name: "other-web",
      });
    });

    // Then it is refused. A client id is what InitiateAuth finds a pool from,
    // and two pools sharing one would make that lookup ambiguous.
    assertInstanceOf(error, SimCognitoUserPoolClientAlreadyExists);
    assertStringIncludes(error.message, pinnedUserPoolId);
  });

  it("refuses an app client for a pool that is not there", () => {
    // Given a simulated Cognito with no pools.
    const simAws = simCognito();
    const cognito = simAws.cognitoIdentityProvider();

    // When a client is registered for an unknown pool.
    const error = assertThrowsError(() => {
      cognito.registerUserPoolClient({
        userPoolId: pinnedUserPoolId,
        id: pinnedClientId,
        name: "web",
      });
    });

    // Then the missing pool is refused, as CreateUserPoolClient refuses one.
    assertInstanceOf(error, SimCognitoResourceNotFoundException);
    assertStringIncludes(error.message, pinnedUserPoolId);
  });

  it("still allocates its own ids for a created pool and client", async () => {
    // Given a simulated Cognito holding a registered pool and client.
    const simAws = simCognito();
    const cognito = simAws.cognitoIdentityProvider();

    cognito.registerUserPool({ id: pinnedUserPoolId, name: "myapp-users" });
    cognito.registerUserPoolClient({
      userPoolId: pinnedUserPoolId,
      id: pinnedClientId,
      name: "web",
    });

    // When a pool and a client are created through the API.
    const createdPool = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "created-users" }),
    );
    const createdUserPoolId = createdPool.UserPool?.Id;
    assertNonNullable(createdUserPoolId, "Created pool id");

    const createdClient = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: createdUserPoolId,
        ClientName: "created-web",
      }),
    );

    // Then both took ids of the simulation's own choosing, neither command
    // having an input to ask for one.
    assertFalse(
      createdUserPoolId === pinnedUserPoolId,
      "A created pool takes an allocated id",
    );
    assertFalse(
      createdClient.UserPoolClient?.ClientId === pinnedClientId,
      "A created app client takes an allocated id",
    );
  });
});
