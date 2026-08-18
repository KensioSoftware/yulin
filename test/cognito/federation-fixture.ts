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

import type {
  AttributeType,
  SchemaAttributeType,
  UserPoolMfaType,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateIdentityProviderCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  CreateUserPoolDomainCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import { SimAwsHttp } from "../../src/serve/http/sim-aws-http.js";
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

  /**
   * The hostname the pool's domain is served on, whichever kind of domain the
   * pool was given.
   */
  readonly domainHost: string;
}

export interface SimCognitoHostedSetUpOptions {
  /** Whether the app client is given a secret, as a server-side one is. */
  readonly generateSecret?: boolean;

  /** The scopes the app client allows, `openid` and `email` by default. */
  readonly scopes?: readonly string[];

  /**
   * The providers the app client supports, the pool's own users and `Google`
   * by default.
   */
  readonly identityProviders?: readonly string[];

  /** The domain the pool is created with, the prefix form by default. */
  readonly domain?: string;

  /** What the pool asks of a second factor, `OFF` by default. */
  readonly mfaConfiguration?: UserPoolMfaType;

  /** The pool's `Schema`, which is the standard attributes by default. */
  readonly schema?: SchemaAttributeType[];
}

/**
 * The username the pool's own user in these tests holds.
 */
export const simCognitoLocalUsername = "alice";

/**
 * The password that user signs in with.
 */
export const simCognitoLocalPassword = "Sup3rSecret!";

export interface SimCognitoLocalUserOptions {
  /** The username the user holds, `alice` by default. */
  readonly username?: string;

  /** The password it signs in with. */
  readonly password?: string;

  /** The attributes it is created with, an email address by default. */
  readonly attributes?: AttributeType[];
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
    identityProviders = ["COGNITO", "Google"],
    domain = simCognitoDomainPrefix,
  } = options;
  const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
  const cognito = simAws.cognitoIdentityProvider();

  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      ...(options.mfaConfiguration !== undefined && {
        MfaConfiguration: options.mfaConfiguration,
      }),
      ...(options.schema !== undefined && { Schema: options.schema }),
    }),
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
    domainHost: domain.includes(".")
      ? domain
      : `${domain}.auth.eu-west-2.amazoncognito.com`,
  };
}

/**
 * Sign a user in at the pool's Google provider and give back the
 * authorization code the browser carried to the callback.
 */
export async function simCognitoAuthorizationCode(
  setUp: SimCognitoHostedSetUp,
  extra: Record<string, string> = {},
): Promise<string> {
  simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
    email: "someone@example.com",
  });

  const parameters = new URLSearchParams({
    response_type: "code",
    client_id: setUp.clientId,
    redirect_uri: simCognitoCallbackUrl,
    identity_provider: "Google",
    ...extra,
  });
  const response = await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
    `https://${setUp.domainHost}/oauth2/authorize?${parameters.toString()}`,
  );
  const location = response.headers.get("location");
  assertNonNullable(location);

  const code = new URL(location).searchParams.get("code");
  assertNonNullable(code);

  return code;
}

/**
 * A confirmed user of the pool's own, holding a password it signs in with.
 *
 * An admin creates it and sets a permanent password on it, which is the
 * shortest route to a user in `CONFIRMED`. The sign-up route to the same place
 * is what the sign-up tests drive.
 */
export async function simCognitoLocalUser(
  setUp: SimCognitoHostedSetUp,
  options: SimCognitoLocalUserOptions = {},
): Promise<void> {
  const {
    username = simCognitoLocalUsername,
    password = simCognitoLocalPassword,
    attributes = [{ Name: "email", Value: `${username}@example.com` }],
  } = options;

  await setUp.cognito.adminCreateUser(
    new AdminCreateUserCommand({
      UserPoolId: setUp.userPoolId,
      Username: username,
      UserAttributes: attributes,
    }),
  );
  await setUp.cognito.adminSetUserPassword(
    new AdminSetUserPasswordCommand({
      UserPoolId: setUp.userPoolId,
      Username: username,
      Password: password,
      Permanent: true,
    }),
  );
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
