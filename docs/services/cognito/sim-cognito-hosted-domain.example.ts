/**
 * Giving a pool a domain, an identity provider and an app client that can use
 * them.
 */

import {
  CreateIdentityProviderCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  CreateUserPoolDomainCommand,
  DescribeUserPoolDomainCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool!.Id!;

await cognito.createUserPoolDomain(
  new CreateUserPoolDomainCommand({
    UserPoolId: userPoolId,
    Domain: "myapp-login",
  }),
);

await cognito.createIdentityProvider(
  new CreateIdentityProviderCommand({
    UserPoolId: userPoolId,
    ProviderName: "Google",
    ProviderType: "Google",
    ProviderDetails: {
      client_id: "google-client-id",
      client_secret: "google-client-secret",
      authorize_scopes: "openid email",
    },
    AttributeMapping: { email: "email", given_name: "given_name" },
  }),
);

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    GenerateSecret: true,
    AllowedOAuthFlowsUserPoolClient: true,
    AllowedOAuthFlows: ["code"],
    AllowedOAuthScopes: ["openid", "email"],
    CallbackURLs: ["https://www.example.com/user/callback"],
    LogoutURLs: ["https://www.example.com/"],
    SupportedIdentityProviders: ["Google"],
  }),
);
console.log(appClient.UserPoolClient!.ClientId);

const domain = await cognito.describeUserPoolDomain(
  new DescribeUserPoolDomainCommand({ Domain: "myapp-login" }),
);
console.log(domain.DomainDescription!.Status); // "ACTIVE"
