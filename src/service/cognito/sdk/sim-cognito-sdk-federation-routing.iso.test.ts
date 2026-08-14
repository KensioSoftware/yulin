import {
  CognitoIdentityProviderClient,
  CreateIdentityProviderCommand,
  CreateUserPoolCommand,
  CreateUserPoolDomainCommand,
  DeleteIdentityProviderCommand,
  DeleteUserPoolDomainCommand,
  DescribeIdentityProviderCommand,
  DescribeUserPoolDomainCommand,
  ListIdentityProvidersCommand,
  UpdateIdentityProviderCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

const googleDetails = {
  client_id: "google-client-id",
  client_secret: "google-client-secret",
  authorize_scopes: "openid email",
};

describe("Cognito federation SDK interception", () => {
  it("routes every domain and provider Command through the intercepted client", async () => {
    // Given an intercepted Cognito SDK client with a pool.
    using simSdk = new SimSdk();
    simSdk.intercept(CognitoIdentityProviderClient);

    const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });
    const pool = await client.send(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = pool.UserPool?.Id;

    // When ordinary SDK code takes a domain and a provider through their
    // lifecycles.
    await client.send(
      new CreateUserPoolDomainCommand({
        UserPoolId: userPoolId,
        Domain: "myapp-login",
      }),
    );
    const describedDomain = await client.send(
      new DescribeUserPoolDomainCommand({ Domain: "myapp-login" }),
    );

    await client.send(
      new CreateIdentityProviderCommand({
        UserPoolId: userPoolId,
        ProviderName: "Google",
        ProviderType: "Google",
        ProviderDetails: googleDetails,
      }),
    );
    await client.send(
      new UpdateIdentityProviderCommand({
        UserPoolId: userPoolId,
        ProviderName: "Google",
        ProviderDetails: googleDetails,
        AttributeMapping: { email: "email" },
      }),
    );
    const describedProvider = await client.send(
      new DescribeIdentityProviderCommand({
        UserPoolId: userPoolId,
        ProviderName: "Google",
      }),
    );
    const listed = await client.send(
      new ListIdentityProvidersCommand({ UserPoolId: userPoolId }),
    );

    await client.send(
      new DeleteIdentityProviderCommand({
        UserPoolId: userPoolId,
        ProviderName: "Google",
      }),
    );
    await client.send(
      new DeleteUserPoolDomainCommand({
        UserPoolId: userPoolId,
        Domain: "myapp-login",
      }),
    );
    const afterDeletion = await client.send(
      new DescribeUserPoolDomainCommand({ Domain: "myapp-login" }),
    );

    // Then each Command reached the simulator, and the answers are the
    // simulated state rather than anything from AWS.
    assertIdentical(describedDomain.DomainDescription?.UserPoolId, userPoolId);
    assertObjectEquals(describedProvider.IdentityProvider?.AttributeMapping, {
      email: "email",
    });
    assertArrayLength(listed.Providers, 1);
    assertObjectEquals(afterDeletion.DomainDescription, {});
  });
});
