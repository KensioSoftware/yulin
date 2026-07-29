/* eslint-disable @typescript-eslint/naming-convention -- the authentication
   parameter names are Cognito's own, rather than identifier names. */
import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

describe("Cognito authentication SDK interception", () => {
  it("signs a user in through an intercepted client and verifies the token", async () => {
    // Given an intercepted Cognito SDK client, and a simulation to read the
    // pool's JWKS from.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    using simSdk = new SimSdk({ simAws });
    simSdk.intercept(CognitoIdentityProviderClient);

    const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });
    const pool = await client.send(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const UserPoolId = pool.UserPool?.Id;
    const appClient = await client.send(
      new CreateUserPoolClientCommand({
        UserPoolId,
        ClientName: "web",
        ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
      }),
    );
    const ClientId = appClient.UserPoolClient?.ClientId;

    await client.send(
      new AdminCreateUserCommand({
        UserPoolId,
        Username: "alice",
        TemporaryPassword: "Temp0rary!",
      }),
    );

    // When ordinary SDK code signs the user in and answers the challenge.
    const challenged = await client.send(
      new AdminInitiateAuthCommand({
        UserPoolId,
        ClientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: "Temp0rary!" },
      }),
    );

    assertIdentical(challenged.ChallengeName, "NEW_PASSWORD_REQUIRED");

    const signedIn = await client.send(
      new AdminRespondToAuthChallengeCommand({
        UserPoolId,
        ClientId,
        ChallengeName: "NEW_PASSWORD_REQUIRED",
        Session: challenged.Session,
        ChallengeResponses: {
          USERNAME: "alice",
          NEW_PASSWORD: "Sup3rSecret!",
        },
      }),
    );

    // Then the token it got back verifies against the pool's JWKS, with
    // nothing having touched the network.
    assertNonNullable(UserPoolId);
    assertNonNullable(ClientId);
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);

    const verifier = CognitoJwtVerifier.create({
      userPoolId: UserPoolId,
      tokenUse: "access",
      clientId: ClientId,
    });

    verifier.cacheJwks(
      simAws.cognitoIdentityProvider().userPool(UserPoolId).jwks(),
    );

    const payload = await verifier.verify(
      signedIn.AuthenticationResult.AccessToken,
    );

    assertIdentical(payload.username, "alice");
  });
});
