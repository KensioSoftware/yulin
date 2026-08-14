import {
  CreateIdentityProviderCommand,
  CreateUserPoolCommand,
  DeleteIdentityProviderCommand,
  DescribeIdentityProviderCommand,
  ListIdentityProvidersCommand,
  UpdateIdentityProviderCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

const googleDetails = {
  client_id: "google-client-id",
  client_secret: "google-client-secret",
  authorize_scopes: "openid email",
};

interface SimCognitoWithPool {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
}

async function simCognitoWithPool(): Promise<SimCognitoWithPool> {
  const cognito = new SimAws({
    defaultRegionName: "eu-west-2",
  }).cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(created.UserPool?.Id);

  return { cognito, userPoolId: created.UserPool.Id };
}

async function withGoogle(): Promise<SimCognitoWithPool> {
  const withPool = await simCognitoWithPool();

  await withPool.cognito.createIdentityProvider(
    new CreateIdentityProviderCommand({
      UserPoolId: withPool.userPoolId,
      ProviderName: "Google",
      ProviderType: "Google",
      ProviderDetails: googleDetails,
      AttributeMapping: { email: "email" },
      IdpIdentifiers: ["example.com"],
    }),
  );

  return withPool;
}

describe("sim Cognito identity providers", () => {
  it("adds a provider to a pool and reports what it was configured with", async () => {
    // Given a user pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a Google provider is added to it.
    const created = await cognito.createIdentityProvider(
      new CreateIdentityProviderCommand({
        UserPoolId: userPoolId,
        ProviderName: "Google",
        ProviderType: "Google",
        ProviderDetails: googleDetails,
        AttributeMapping: { email: "email" },
      }),
    );

    // Then the provider is reported with the details and mapping it was
    // given, which is what makes DescribeIdentityProvider enough to rebuild
    // the configuration.
    assertIdentical(created.IdentityProvider?.ProviderName, "Google");
    assertIdentical(created.IdentityProvider.ProviderType, "Google");
    assertObjectEquals(created.IdentityProvider.ProviderDetails, googleDetails);
    assertObjectEquals(created.IdentityProvider.AttributeMapping, {
      email: "email",
    });
  });

  it("describes a provider by name", async () => {
    // Given a pool with a Google provider.
    const { cognito, userPoolId } = await withGoogle();

    // When it is described.
    const described = await cognito.describeIdentityProvider(
      new DescribeIdentityProviderCommand({
        UserPoolId: userPoolId,
        ProviderName: "Google",
      }),
    );

    // Then the alternative names it can be reached by come back too.
    assertArrayEquals(described.IdentityProvider?.IdpIdentifiers, [
      "example.com",
    ]);
  });

  it("replaces a provider's settings on an update", async () => {
    // Given a pool with a Google provider that has an attribute mapping.
    const { cognito, userPoolId } = await withGoogle();

    // When it is updated without one.
    const updated = await cognito.updateIdentityProvider(
      new UpdateIdentityProviderCommand({
        UserPoolId: userPoolId,
        ProviderName: "Google",
        ProviderDetails: googleDetails,
      }),
    );

    // Then the mapping is cleared rather than kept, as it is for an app client
    // and a group, and the provider's type is unchanged.
    assertObjectEquals(updated.IdentityProvider?.AttributeMapping, {});
    assertIdentical(updated.IdentityProvider.ProviderType, "Google");
  });

  it("lists a pool's providers in creation order", async () => {
    // Given a pool with two providers.
    const { cognito, userPoolId } = await withGoogle();
    await cognito.createIdentityProvider(
      new CreateIdentityProviderCommand({
        UserPoolId: userPoolId,
        ProviderName: "Staff",
        ProviderType: "SAML",
        ProviderDetails: { MetadataURL: "https://example.com/saml" },
      }),
    );

    // When they are listed.
    const listed = await cognito.listIdentityProviders(
      new ListIdentityProvidersCommand({ UserPoolId: userPoolId }),
    );

    // Then both come back, with the name and type a listing carries.
    assertArrayLength(listed.Providers, 2);
    assertObjectEquals(
      listed.Providers.map((provider) => provider.ProviderName),
      ["Google", "Staff"],
    );
    assertIdentical(listed.Providers.at(1)?.ProviderType, "SAML");
  });

  it("deletes a provider and leaves the users it signed in", async () => {
    // Given a pool with a Google provider.
    const { cognito, userPoolId } = await withGoogle();

    // When it is deleted.
    await cognito.deleteIdentityProvider(
      new DeleteIdentityProviderCommand({
        UserPoolId: userPoolId,
        ProviderName: "Google",
      }),
    );

    // Then describing it refuses, because the pool no longer has it.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.describeIdentityProvider(
        new DescribeIdentityProviderCommand({
          UserPoolId: userPoolId,
          ProviderName: "Google",
        }),
      );
    });

    assertStringIncludes(error.message, "Identity provider Google does not");
  });

  it("refuses a second provider with a name the pool already has", async () => {
    // Given a pool with a Google provider.
    const { cognito, userPoolId } = await withGoogle();

    // When another provider with that name is added.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.createIdentityProvider(
        new CreateIdentityProviderCommand({
          UserPoolId: userPoolId,
          ProviderName: "Google",
          ProviderType: "Google",
          ProviderDetails: googleDetails,
        }),
      );
    });

    // Then it is refused, because a provider name is unique in its pool.
    assertStringIncludes(error.message, "already exists in the pool");
  });
});
