import {
  type ExplicitAuthFlowsType,
  type UpdateUserPoolClientCommandInput,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  UpdateUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertFalse,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

interface RefusedInput {
  readonly label: string;
  readonly input: Partial<UpdateUserPoolClientCommandInput>;
  readonly says: string;
}

const refusedInputs: readonly RefusedInput[] = [
  {
    label: "SupportedIdentityProviders",
    input: { SupportedIdentityProviders: ["COGNITO", "Google"] },
    says: "federated sign-in happens at the provider",
  },
  {
    label: "AllowedOAuthFlowsUserPoolClient",
    input: { AllowedOAuthFlowsUserPoolClient: true },
    says: "the OAuth 2.0 authorization server endpoints",
  },
  {
    label: "EnableTokenRevocation",
    input: { EnableTokenRevocation: false },
    says: "token revocation",
  },
  {
    label: "AllowedOAuthFlows",
    input: { AllowedOAuthFlows: ["code"] },
    says: "OAuth grants through managed login",
  },
  {
    label: "AllowedOAuthScopes",
    input: { AllowedOAuthScopes: ["openid"] },
    says: "OAuth scopes",
  },
  {
    label: "CallbackURLs",
    input: { CallbackURLs: ["https://example.com"] },
    says: "managed login redirects",
  },
  {
    label: "LogoutURLs",
    input: { LogoutURLs: ["https://example.com/out"] },
    says: "managed login redirects",
  },
  {
    label: "DefaultRedirectURI",
    input: { DefaultRedirectURI: "https://example.com" },
    says: "managed login redirects",
  },
  {
    label: "AnalyticsConfiguration",
    input: { AnalyticsConfiguration: { ApplicationId: "app" } },
    says: "Amazon Pinpoint analytics",
  },
  {
    label: "AuthSessionValidity",
    input: { AuthSessionValidity: 5 },
    says: "the authentication session lifetime",
  },
  {
    label: "EnablePropagateAdditionalUserContextData",
    input: { EnablePropagateAdditionalUserContextData: true },
    says: "threat protection context data",
  },
  {
    label: "RefreshTokenRotation",
    input: { RefreshTokenRotation: { Feature: "ENABLED" } },
    says: "refresh token rotation",
  },
  {
    label: "ReadAttributes",
    input: { ReadAttributes: ["email"] },
    says: "per-client attribute permissions",
  },
  {
    label: "WriteAttributes",
    input: { WriteAttributes: ["email"] },
    says: "per-client attribute permissions",
  },
];

interface SimCognitoWithClient {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
}

async function simCognitoWithClient(): Promise<SimCognitoWithClient> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const appClient = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: pool.UserPool.Id,
      ClientName: "web",
    }),
  );

  assertNonNullable(appClient.UserPoolClient?.ClientId);

  return {
    cognito,
    userPoolId: pool.UserPool.Id,
    clientId: appClient.UserPoolClient.ClientId,
  };
}

async function refusedUpdate(
  withClient: SimCognitoWithClient,
  input: Partial<UpdateUserPoolClientCommandInput>,
  label: string,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await withClient.cognito.updateUserPoolClient(
      new UpdateUserPoolClientCommand({
        UserPoolId: withClient.userPoolId,
        ClientId: withClient.clientId,
        ClientName: "web",
        ...input,
      }),
    );
  }, label);
}

describe("sim Cognito UpdateUserPoolClient unsimulated options", () => {
  it("refuses every UpdateUserPoolClient input it does not simulate", async () => {
    // Given a pool with an app client.
    const withClient = await simCognitoWithClient();

    // When each unsimulated input is used on an update.
    const outcomes = await Promise.all(
      refusedInputs.map(async (refused) => ({
        refused,
        error: await refusedUpdate(withClient, refused.input, refused.label),
      })),
    );

    // Then each request is refused, saying what it was that could not be
    // honoured, and naming the operation that was asked for.
    for (const { refused, error } of outcomes) {
      assertInstanceOf(error, SimCognitoInvalidParameterException);
      assertStringIncludes(error.message, refused.says);
      assertStringIncludes(error.message, "UpdateUserPoolClient");
    }
  });

  it("takes the two managed login settings it accepts on creation", async () => {
    // Given a pool with an app client.
    const withClient = await simCognitoWithClient();

    // When an update names the settings accepted at one value each.
    const updated = await withClient.cognito.updateUserPoolClient(
      new UpdateUserPoolClientCommand({
        UserPoolId: withClient.userPoolId,
        ClientId: withClient.clientId,
        ClientName: "web",
        SupportedIdentityProviders: ["COGNITO"],
        AllowedOAuthFlowsUserPoolClient: false,
        EnableTokenRevocation: true,
      }),
    );

    // Then the update is applied, and the two settings it reports back are
    // what this request set rather than what the creating one did.
    assertFalse(updated.UserPoolClient?.AllowedOAuthFlowsUserPoolClient);
    assertArrayEquals(updated.UserPoolClient.SupportedIdentityProviders, [
      "COGNITO",
    ]);
  });

  it("refuses a client name Cognito would not accept", async () => {
    // Given a pool with an app client.
    const withClient = await simCognitoWithClient();

    // When an update renames it to something with a character Cognito
    // rejects.
    const error = await refusedUpdate(
      withClient,
      { ClientName: "web/app" },
      "ClientName",
    );

    // Then it is refused, as the creating request would have been.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "characters Cognito does not allow");
  });

  it("refuses an authentication flow that is not a Cognito flow", async () => {
    // Given a pool with an app client.
    const withClient = await simCognitoWithClient();

    // When an update names a flow that does not exist.
    const error = await refusedUpdate(
      withClient,
      // The SDK types name the flows Cognito has, and the wire format takes
      // any string, so this is what reaches a real pool from code that built
      // the request itself.
      {
        ExplicitAuthFlows: ["ALLOW_MAGIC_LINK_AUTH" as ExplicitAuthFlowsType],
      },
      "ExplicitAuthFlows",
    );

    // Then it is refused rather than stored, because a typo in a flow name
    // would otherwise turn into a puzzling sign-in failure much later.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "is not a Cognito authentication flow");
  });
});
