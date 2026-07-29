import {
  type CreateUserPoolClientCommandInput,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
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
  readonly input: Partial<CreateUserPoolClientCommandInput>;
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
    label: "PreventUserExistenceErrors",
    input: { PreventUserExistenceErrors: "ENABLED" },
    says: "hiding whether a user exists",
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
    label: "ClientSecret",
    input: { ClientSecret: "a".repeat(32) },
    says: "a secret of your own",
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

interface SimCognitoWithPool {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
}

async function simCognitoWithPool(): Promise<SimCognitoWithPool> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(created.UserPool?.Id);

  return { cognito, userPoolId: created.UserPool.Id };
}

async function refusedClient(
  withPool: SimCognitoWithPool,
  input: Partial<CreateUserPoolClientCommandInput>,
  label: string,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await withPool.cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: withPool.userPoolId,
        ClientName: "web",
        ...input,
      }),
    );
  }, label);
}

describe("sim Cognito app client unsimulated options", () => {
  it("refuses every CreateUserPoolClient input it does not simulate", async () => {
    // Given a user pool.
    const withPool = await simCognitoWithPool();

    // When each unsimulated input is used.
    const outcomes = await Promise.all(
      refusedInputs.map(async (refused) => ({
        refused,
        error: await refusedClient(withPool, refused.input, refused.label),
      })),
    );

    // Then each request is refused, saying what it was that could not be
    // honoured.
    for (const { refused, error } of outcomes) {
      assertInstanceOf(error, SimCognitoInvalidParameterException);
      assertStringIncludes(error.message, refused.says);
    }
  });

  it("accepts the inputs whose only simulated value is their default", async () => {
    // Given a user pool.
    const withPool = await simCognitoWithPool();

    // When a client asks for the settings this simulation does model.
    const created = await withPool.cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: withPool.userPoolId,
        ClientName: "web",
        SupportedIdentityProviders: ["COGNITO"],
        AllowedOAuthFlowsUserPoolClient: false,
        EnableTokenRevocation: true,
        PreventUserExistenceErrors: "LEGACY",
      }),
    );

    // Then it is created rather than refused.
    assertIdentical(created.UserPoolClient?.ClientName, "web");
  });
});
