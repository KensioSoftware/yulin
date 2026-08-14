import { CreateUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCreateIdentityProviderCommandInput } from "./identity-provider.command.js";

interface RefusedProvider {
  readonly label: string;
  readonly input: Omit<SimCreateIdentityProviderCommandInput, "UserPoolId">;
  readonly says: string;
}

const socialDetails = {
  client_id: "client",
  client_secret: "secret",
  authorize_scopes: "openid",
};

const refusedProviders: readonly RefusedProvider[] = [
  {
    label: "no provider name",
    input: { ProviderType: "Google", ProviderDetails: socialDetails },
    says: "ProviderName is required",
  },
  {
    label: "the name the pool's own users sign in under",
    input: {
      ProviderName: "COGNITO",
      ProviderType: "Google",
      ProviderDetails: socialDetails,
    },
    says: "is reserved",
  },
  {
    label: "a name longer than Cognito allows",
    input: {
      ProviderName: "g".repeat(33),
      ProviderType: "Google",
      ProviderDetails: socialDetails,
    },
    says: "is too long",
  },
  {
    label: "no provider type",
    input: { ProviderName: "Google", ProviderDetails: socialDetails },
    says: "ProviderType is required",
  },
  {
    label: "a provider type that does not exist",
    input: {
      ProviderName: "Whatever",
      ProviderType: "Whatever",
      ProviderDetails: socialDetails,
    },
    says: "is not a provider type",
  },
  {
    label: "a social provider missing its credentials",
    input: {
      ProviderName: "Google",
      ProviderType: "Google",
      ProviderDetails: { client_id: "client" },
    },
    says: "ProviderDetails is missing client_secret, authorize_scopes",
  },
  {
    label: "a SAML provider with no metadata",
    input: {
      ProviderName: "Staff",
      ProviderType: "SAML",
      ProviderDetails: {},
    },
    says: "ProviderDetails is missing MetadataURL or MetadataFile",
  },
  {
    label: "an attribute mapping onto the username",
    input: {
      ProviderName: "Google",
      ProviderType: "Google",
      ProviderDetails: socialDetails,
      AttributeMapping: { username: "sub" },
    },
    says: "AttributeMapping cannot map to 'username'",
  },
  {
    label: "an attribute mapping onto an attribute no pool holds",
    input: {
      ProviderName: "Google",
      ProviderType: "Google",
      ProviderDetails: socialDetails,
      AttributeMapping: { "custom:team": "team" },
    },
    says: "is not in the pool's schema",
  },
];

async function refusedProviderError(
  input: Omit<SimCreateIdentityProviderCommandInput, "UserPoolId">,
  label: string,
): Promise<Error> {
  const cognito = new SimAws({
    defaultRegionName: "eu-west-2",
  }).cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );
  assertNonNullable(created.UserPool?.Id);

  return await assertThrowsErrorAsync(async () => {
    await cognito.createIdentityProvider({
      input: { UserPoolId: created.UserPool?.Id, ...input },
    });
  }, label);
}

describe("sim Cognito identity provider validation", () => {
  it("refuses a provider real Cognito would refuse", async () => {
    // Given each provider request that could not have been made on real AWS.
    // When each is used to add a provider to a pool.
    const outcomes = await Promise.all(
      refusedProviders.map(async (refused) => ({
        refused,
        error: await refusedProviderError(refused.input, refused.label),
      })),
    );

    // Then each is refused, saying what was wrong with it.
    for (const { refused, error } of outcomes) {
      assertStringIncludes(error.message, refused.says);
    }
  });
});
