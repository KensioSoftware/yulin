import {
  type CreateUserPoolClientCommandInput,
  type PreventUserExistenceErrorTypes,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
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
    label: "EnableTokenRevocation",
    input: { EnableTokenRevocation: false },
    says: "token revocation",
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
    label: "EnablePropagateAdditionalUserContextData",
    input: { EnablePropagateAdditionalUserContextData: true },
    says: "threat protection context data",
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

  it("accepts the OAuth settings of a client that signs in at a domain", async () => {
    // Given a user pool.
    const withPool = await simCognitoWithPool();

    // When a client asks for the settings this simulation does model.
    const created = await withPool.cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: withPool.userPoolId,
        ClientName: "web",
        SupportedIdentityProviders: ["COGNITO"],
        AllowedOAuthFlowsUserPoolClient: true,
        EnableTokenRevocation: true,
      }),
    );

    // Then it is created rather than refused.
    assertIdentical(created.UserPoolClient?.ClientName, "web");

    // And the OAuth settings are reported back as the request set them, so
    // what a template declared stays visible on the client.
    const clientId = created.UserPoolClient.ClientId;
    assertNonNullable(clientId);

    const described = await withPool.cognito.describeUserPoolClient(
      new DescribeUserPoolClientCommand({
        UserPoolId: withPool.userPoolId,
        ClientId: clientId,
      }),
    );
    assertTrue(described.UserPoolClient?.AllowedOAuthFlowsUserPoolClient);
    assertArrayEquals(described.UserPoolClient.SupportedIdentityProviders, [
      "COGNITO",
    ]);
  });

  it("reports no OAuth settings for a client created without them", async () => {
    // Given a user pool.
    const withPool = await simCognitoWithPool();

    // When a client is created without either managed login setting.
    const created = await withPool.cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: withPool.userPoolId,
        ClientName: "web",
      }),
    );

    // Then the authorization server is off, and none of the settings it gates
    // is reported at all rather than being reported empty.
    assertFalse(created.UserPoolClient?.AllowedOAuthFlowsUserPoolClient);
    assertUndefined(created.UserPoolClient.SupportedIdentityProviders);
    assertUndefined(created.UserPoolClient.CallbackURLs);
    assertUndefined(created.UserPoolClient.AllowedOAuthFlows);
  });

  it("takes a PreventUserExistenceErrors of either value", async () => {
    // Given a user pool.
    const withPool = await simCognitoWithPool();

    // When a client hides whether a user exists.
    const created = await withPool.cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: withPool.userPoolId,
        ClientName: "web",
        PreventUserExistenceErrors: "ENABLED",
      }),
    );

    // Then the setting is kept, and a client that said nothing gets the
    // LEGACY the API defaults to.
    assertIdentical(
      created.UserPoolClient?.PreventUserExistenceErrors,
      "ENABLED",
    );

    const quiet = await withPool.cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: withPool.userPoolId,
        ClientName: "mobile",
      }),
    );

    assertIdentical(quiet.UserPoolClient?.PreventUserExistenceErrors, "LEGACY");
  });

  it("refuses a PreventUserExistenceErrors that is neither", async () => {
    // Given a user pool.
    const withPool = await simCognitoWithPool();

    // When a client asks for a setting Cognito does not have.
    const error = await refusedClient(
      withPool,
      // The SDK types name the two values Cognito has, and the wire format
      // takes any string, so this is what reaches a real pool from code that
      // built the request itself.
      {
        PreventUserExistenceErrors:
          "DISABLED" as PreventUserExistenceErrorTypes,
      },
      "PreventUserExistenceErrors",
    );

    // Then it is refused, rather than kept and quietly ignored later.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "is not a Cognito setting");
  });
});
