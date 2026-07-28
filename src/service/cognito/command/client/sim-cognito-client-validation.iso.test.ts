import {
  type CreateUserPoolClientCommandInput,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeUserPoolClientCommand,
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
import {
  SimCognitoInvalidParameterException,
  SimCognitoResourceNotFoundException,
} from "../../error/sim-cognito.error.js";
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

describe("sim Cognito app client validation", () => {
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

  it("refuses a client with no name", async () => {
    // Given a user pool.
    const withPool = await simCognitoWithPool();

    // When a client is created without a name.
    const error = await refusedClient(
      withPool,
      { ClientName: undefined },
      "no name",
    );

    // Then it is refused.
    assertStringIncludes(error.message, "ClientName is required");
  });

  it("refuses an authentication flow Cognito does not have", async () => {
    // Given a user pool.
    const withPool = await simCognitoWithPool();

    // When a client asks for a flow that does not exist. The SDK's own types
    // insist on a known one, so this is the request as it reaches the
    // simulator.
    const error = await assertThrowsErrorAsync(async () => {
      await withPool.cognito.createUserPoolClient({
        input: {
          UserPoolId: withPool.userPoolId,
          ClientName: "web",
          ExplicitAuthFlows: ["ALLOW_USER_PASSWORD"],
        },
      });
    });

    // Then it is refused rather than stored to fail at sign-in.
    assertStringIncludes(error.message, "is not a Cognito authentication flow");
  });

  it("refuses a client mixing legacy and current authentication flows", async () => {
    // Given a user pool.
    const withPool = await simCognitoWithPool();

    // When a client asks for both generations of flow at once.
    const error = await refusedClient(
      withPool,
      {
        ExplicitAuthFlows: ["USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
      },
      "mixed flows",
    );

    // Then it is refused, as real Cognito refuses it.
    assertStringIncludes(error.message, "cannot mix the legacy flows");
  });

  it("allows the legacy authentication flows on their own", async () => {
    // Given a user pool.
    const withPool = await simCognitoWithPool();

    // When a client asks only for legacy flows.
    const created = await withPool.cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: withPool.userPoolId,
        ClientName: "legacy",
        ExplicitAuthFlows: ["USER_PASSWORD_AUTH"],
      }),
    );

    // Then it is created, as an app client made years ago would be.
    assertIdentical(
      created.UserPoolClient?.ExplicitAuthFlows?.[0],
      "USER_PASSWORD_AUTH",
    );
  });

  it("refuses token lifetimes outside the range Cognito allows", async () => {
    // Given a user pool.
    const withPool = await simCognitoWithPool();

    // When an access token is asked to last two days, and another one minute.
    const tooLong = await refusedClient(
      withPool,
      {
        AccessTokenValidity: 2,
        TokenValidityUnits: { AccessToken: "days" },
      },
      "too long",
    );
    const tooShort = await refusedClient(
      withPool,
      {
        AccessTokenValidity: 1,
        TokenValidityUnits: { AccessToken: "minutes" },
      },
      "too short",
    );

    // Then both are refused, because an access token lasts between five
    // minutes and a day.
    assertStringIncludes(tooLong.message, "AccessTokenValidity of 2 days");
    assertStringIncludes(tooShort.message, "AccessTokenValidity of 1 minutes");
  });

  it("refuses a token validity that is not a whole number", async () => {
    // Given a user pool.
    const withPool = await simCognitoWithPool();

    // When half an hour is asked for as a fraction.
    const error = await refusedClient(
      withPool,
      { AccessTokenValidity: 0.5 },
      "fractional",
    );

    // Then it is refused.
    assertStringIncludes(
      error.message,
      "AccessTokenValidity must be a whole number of hours",
    );
  });

  it("refuses a token validity unit Cognito does not have", async () => {
    // Given a user pool.
    const withPool = await simCognitoWithPool();

    // When a lifetime is counted in weeks.
    const error = await assertThrowsErrorAsync(async () => {
      await withPool.cognito.createUserPoolClient({
        input: {
          UserPoolId: withPool.userPoolId,
          ClientName: "web",
          TokenValidityUnits: { IdToken: "weeks" },
        },
      });
    });

    // Then it is refused.
    assertStringIncludes(
      error.message,
      "TokenValidityUnits for IdTokenValidity is 'weeks'",
    );
  });

  it("substitutes the default for a refresh token validity of zero", async () => {
    // Given a user pool.
    const withPool = await simCognitoWithPool();

    // When a client asks for a refresh token validity of zero.
    const created = await withPool.cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: withPool.userPoolId,
        ClientName: "web",
        RefreshTokenValidity: 0,
      }),
    );

    // Then Cognito's thirty days is used instead, as real Cognito overrides
    // it.
    assertIdentical(created.UserPoolClient?.RefreshTokenValidity, 30);
  });

  it("refuses a request naming no app client, or one that is not a client id", async () => {
    // Given a user pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a client is described with a missing id and with a malformed one.
    const missing = await assertThrowsErrorAsync(async () => {
      await cognito.describeUserPoolClient({
        input: { UserPoolId: userPoolId },
      });
    });
    const malformed = await assertThrowsErrorAsync(async () => {
      await cognito.describeUserPoolClient(
        new DescribeUserPoolClientCommand({
          UserPoolId: userPoolId,
          ClientId: "web client",
        }),
      );
    });

    // Then both fail as validation errors rather than as missing clients.
    assertInstanceOf(missing, SimCognitoInvalidParameterException);
    assertStringIncludes(missing.message, "ClientId is required");
    assertInstanceOf(malformed, SimCognitoInvalidParameterException);
    assertStringIncludes(malformed.message, "is not an app client id");
  });

  it("reports an app client that does not exist as missing", async () => {
    // Given a user pool with no clients.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a client that was never created is described.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.describeUserPoolClient(
        new DescribeUserPoolClientCommand({
          UserPoolId: userPoolId,
          ClientId: "1a2b3c4d5e6f7g8h9i0j1k2l3m",
        }),
      );
    });

    // Then it is missing.
    assertInstanceOf(error, SimCognitoResourceNotFoundException);
    assertStringIncludes(error.message, "does not exist");
  });
});
