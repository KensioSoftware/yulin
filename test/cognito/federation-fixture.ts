/**
 * The arrangement the hosted domain and identity provider test files share: a
 * pool with a domain, an app client configured for the authorization code
 * grant, and a Google identity provider.
 *
 * It lives under `test/` for the same reasons as `test/cognito/cfn-deploy.ts`:
 * a test file cannot export helpers alongside its own `describe` calls, and
 * `test/**` is type-checked with everything else and excluded from the
 * published build.
 */

import {
  CreateIdentityProviderCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  CreateUserPoolDomainCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimCognitoIdentityProvider } from "../../src/service/cognito/index.js";

/**
 * The callback URL the app client in these tests registers.
 */
export const simCognitoCallbackUrl = "https://www.example.com/user/callback";

/**
 * The sign-out URL the app client in these tests registers.
 */
export const simCognitoLogoutUrl = "https://www.example.com/";

/**
 * The domain prefix the pool in these tests is served on.
 */
export const simCognitoDomainPrefix = "myapp-login";

/**
 * The hostname that prefix domain answers on.
 */
export const simCognitoDomainHost = `${simCognitoDomainPrefix}.auth.eu-west-2.amazoncognito.com`;

export interface SimCognitoHostedSetUp {
  readonly simAws: SimAws;
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly clientSecret: string | undefined;
}

export interface SimCognitoHostedSetUpOptions {
  /** Whether the app client is given a secret, as a server-side one is. */
  readonly generateSecret?: boolean;

  /** The scopes the app client allows, `openid` and `email` by default. */
  readonly scopes?: readonly string[];

  /** The providers the app client supports, `Google` by default. */
  readonly identityProviders?: readonly string[];

  /** The domain the pool is created with, the prefix form by default. */
  readonly domain?: string;
}

/**
 * A pool with a hosted domain, an app client that can complete an
 * authorization code grant, and a Google identity provider.
 */
export async function simCognitoHosted(
  options: SimCognitoHostedSetUpOptions = {},
): Promise<SimCognitoHostedSetUp> {
  const {
    generateSecret = false,
    scopes = ["openid", "email"],
    identityProviders = ["Google"],
    domain = simCognitoDomainPrefix,
  } = options;
  const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
  const cognito = simAws.cognitoIdentityProvider();

  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );
  assertNonNullable(pool.UserPool?.Id);
  const userPoolId = pool.UserPool.Id;

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

  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "web",
      GenerateSecret: generateSecret,
      // The admin flow is on so that a test can show a federated user cannot
      // sign in with it, which is what real Cognito refuses too.
      ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthFlows: ["code"],
      AllowedOAuthScopes: [...scopes],
      CallbackURLs: [simCognitoCallbackUrl],
      LogoutURLs: [simCognitoLogoutUrl],
      SupportedIdentityProviders: [...identityProviders],
    }),
  );
  assertNonNullable(client.UserPoolClient?.ClientId);

  // A domain with dots in it is a custom one, and a custom one is served with
  // a certificate.
  await cognito.createUserPoolDomain(
    new CreateUserPoolDomainCommand({
      UserPoolId: userPoolId,
      Domain: domain,
      ...(domain.includes(".") && {
        CustomDomainConfig: {
          CertificateArn:
            "arn:aws:acm:us-east-1:888888888888:certificate/a1b2c3d4",
        },
      }),
    }),
  );

  return {
    simAws,
    cognito,
    userPoolId,
    clientId: client.UserPoolClient.ClientId,
    clientSecret: client.UserPoolClient.ClientSecret,
  };
}

/**
 * Say who is signed in at the pool's Google provider.
 */
export function simCognitoSignedInAtGoogle(
  setUp: SimCognitoHostedSetUp,
  subject: string,
  claims: Readonly<Record<string, string>>,
): void {
  setUp.cognito
    .userPool(setUp.userPoolId)
    .auth.identityProviders.require("Google")
    .signInAs({ Subject: subject, Claims: claims });
}
