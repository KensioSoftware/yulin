import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  CompleteWebAuthnRegistrationCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DeleteWebAuthnCredentialCommand,
  InitiateAuthCommand,
  ListWebAuthnCredentialsCommand,
  SetUserPoolMfaConfigCommand,
  StartWebAuthnRegistrationCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

describe("Cognito passkey SDK interception", () => {
  it("routes every passkey Command through the intercepted client", async () => {
    // Given an intercepted Cognito SDK client, and a pool that registers
    // passkeys against a relying party.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    using simSdk = new SimSdk({ simAws });
    simSdk.intercept(CognitoIdentityProviderClient);

    const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });
    const pool = await client.send(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = pool.UserPool?.Id;
    assertTypeString(userPoolId);

    await client.send(
      new SetUserPoolMfaConfigCommand({
        UserPoolId: userPoolId,
        MfaConfiguration: "OPTIONAL",
        WebAuthnConfiguration: { RelyingPartyId: "myapp.example.com" },
      }),
    );

    const appClient = await client.send(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
        ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
      }),
    );

    await client.send(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );
    await client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        Password: "Sup3rSecret!",
        Permanent: true,
      }),
    );

    const signedIn = await client.send(
      new InitiateAuthCommand({
        ClientId: appClient.UserPoolClient?.ClientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
      }),
    );
    const AccessToken = signedIn.AuthenticationResult?.AccessToken;

    // When ordinary SDK code registers a passkey, lists it and deletes it.
    const started = await client.send(
      new StartWebAuthnRegistrationCommand({ AccessToken }),
    );
    const credential = simAws
      .cognitoIdentityProvider()
      .userPool(userPoolId)
      .webAuthnCredential("alice");

    await client.send(
      new CompleteWebAuthnRegistrationCommand({
        AccessToken,
        Credential: credential,
      }),
    );

    const listed = await client.send(
      new ListWebAuthnCredentialsCommand({ AccessToken }),
    );

    await client.send(
      new DeleteWebAuthnCredentialCommand({
        AccessToken,
        CredentialId: credential.id,
      }),
    );

    const emptied = await client.send(
      new ListWebAuthnCredentialsCommand({ AccessToken }),
    );

    // Then each Command reached simulated Cognito.
    assertNonNullable(started.CredentialCreationOptions);
    assertArrayLength(listed.Credentials ?? [], 1);
    assertIdentical(listed.Credentials?.[0]?.CredentialId, credential.id);
    assertArrayLength(emptied.Credentials ?? [], 0);
  });
});
