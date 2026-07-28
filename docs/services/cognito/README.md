# Simulated Cognito user pools

Yulin includes a simulated Cognito user pool directory for tests and local development. Pools and
their app clients are held in memory, and every operation is authorized by simulated IAM.

Only user pools are simulated. Cognito identity pools, which exchange a token for AWS credentials,
are a different service and are not simulated.

Cognito-specific types are imported from the `@kensio/yulin/cognito` subpath.

## Available functionality

Sim Cognito currently supports:

- `CreateUserPoolCommand`, `DescribeUserPoolCommand`, `DeleteUserPoolCommand` and
  `ListUserPoolsCommand`
- `CreateUserPoolClientCommand`, `DescribeUserPoolClientCommand`, `DeleteUserPoolClientCommand` and
  `ListUserPoolClientsCommand`
- Pool ids in the real `<region>_<nine characters>` form, and pool ARNs built from them
- The real default password policy, and a policy the request sets
- App client authentication flows, token lifetimes and generated client secrets
- Authorization of every operation by simulated IAM, against the real IAM action and ARN
- Calls made from inside a simulated Lambda handler, authorized as the function's execution role

There are no users yet, so nothing signs in. Users, groups, tokens and the authentication flows
themselves are separate pieces of work.

## Creating a pool and an app client

A pool needs a name. Everything else has a default, and the defaults here are the ones real Cognito
applies.

```typescript sim-cognito-create-user-pool
/**
 * Creating a simulated user pool and an app client in it.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);

console.log(pool.UserPool?.Id); // "us-east-1_aBcDeFgHi"
console.log(pool.UserPool?.Arn);
// "arn:aws:cognito-idp:us-east-1:888888888888:userpool/us-east-1_aBcDeFgHi"

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: pool.UserPool?.Id,
    ClientName: "web",
  }),
);

console.log(appClient.UserPoolClient?.ClientId); // 26 lowercase characters
```

A pool id names the region the pool was created in, as real pool ids do. Application code that
splits the id on the underscore to find the region works here for the same reason it works on AWS.

Two pools may share a name. Only the id identifies one.

## Password policy

A pool created without a `Policies` of its own gets the real default: eight characters, with an
uppercase letter, a lowercase letter, a number and a symbol each required. A request setting some of
those keeps the defaults for the rest.

```typescript sim-cognito-password-policy
/**
 * Reading a simulated user pool's password policy.
 */

import { CreateUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const pool = await simAws.cognitoIdentityProvider().createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    Policies: { PasswordPolicy: { MinimumLength: 12 } },
  }),
);

const passwordPolicy = pool.UserPool?.Policies?.PasswordPolicy;

console.log(passwordPolicy?.MinimumLength); // 12
console.log(passwordPolicy?.RequireSymbols); // true, the default
```

Nothing checks a password against the policy yet, because a pool holds no users.

## App clients

An app client is how an application reaches a pool. What it holds decides what that application can
do, so the settings later work depends on are stored and reported rather than dropped.

```typescript sim-cognito-app-client
/**
 * A simulated app client with a secret, its authentication flows and its token
 * lifetimes.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: pool.UserPool?.Id,
    ClientName: "server",
    GenerateSecret: true,
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    AccessTokenValidity: 15,
    TokenValidityUnits: { AccessToken: "minutes" },
  }),
);

// The secret is readable again afterwards, as it is on real Cognito.
const described = await cognito.describeUserPoolClient(
  new DescribeUserPoolClientCommand({
    UserPoolId: pool.UserPool?.Id,
    ClientId: appClient.UserPoolClient?.ClientId,
  }),
);

console.log(described.UserPoolClient?.ClientSecret?.length); // 52
console.log(described.UserPoolClient?.RefreshTokenValidity); // 30, the default
```

A client created without `GenerateSecret` has no `ClientSecret` at all, rather than an empty one. A
client created without `ExplicitAuthFlows` supports `ALLOW_REFRESH_TOKEN_AUTH`, `ALLOW_USER_SRP_AUTH`
and `ALLOW_CUSTOM_AUTH`, which is what real Cognito gives it. Sign-in with a username and password is
not among them, which is why `USER_PASSWORD_AUTH` fails on a client nobody configured for it.

Token lifetimes default to an hour for access and ID tokens and thirty days for refresh tokens. The
units are separate inputs, so `AccessTokenValidity: 1` means an hour and `RefreshTokenValidity: 1`
means a day unless `TokenValidityUnits` says otherwise.

The legacy authentication flows (`ADMIN_NO_SRP_AUTH`, `CUSTOM_AUTH_FLOW_ONLY` and
`USER_PASSWORD_AUTH`) work on their own, and a request mixing them with the `ALLOW_` prefixed values
is refused, as real Cognito refuses it.

## Pool ARNs and IAM policies

A pool ARN is the pool id after `userpool/`, so the region appears twice:
`arn:aws:cognito-idp:eu-west-2:111111111111:userpool/eu-west-2_aBcDeFgHi`.

App clients have no ARN of their own. Every app client operation authorizes against the ARN of the
pool the client belongs to, so a policy granting `cognito-idp:DescribeUserPoolClient` on a pool
reaches every client in it. There is no way to narrow it to one client, here or on real AWS.

```typescript sim-cognito-iam-policy
/**
 * A simulated IAM policy allowing a Role to read one user pool's app clients.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;
const regionName = simAws.defaultRegionName;
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
  }),
);

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "AppClientReader",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: `arn:aws:iam::${accountId}:root` },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "AppClientReader",
    PolicyName: "ReadAppClients",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "cognito-idp:DescribeUserPoolClient",
        // The app client is reached through its pool's ARN.
        Resource: `arn:aws:cognito-idp:${regionName}:${accountId}:userpool/${userPoolId}`,
      },
    }),
  }),
);

const described = await cognito.describeUserPoolClient(
  new DescribeUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientId: appClient.UserPoolClient?.ClientId,
  }),
  { caller: { kind: "arn", arn: role.Role.Arn } },
);

console.log(described.UserPoolClient?.ClientName); // "web"
```

`CreateUserPool` and `ListUserPools` are the exception. Real Cognito gives those two actions no
resource-level permissions, so they authorize against `*` here, and a policy naming individual pool
ARNs grants nothing.

## Listing pools and clients

`ListUserPools` requires `MaxResults`, as the real API does. A request without it is refused rather
than answered with a default.

```typescript sim-cognito-list-user-pools
/**
 * Listing simulated user pools.
 */

import {
  CreateUserPoolCommand,
  ListUserPoolsCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

await cognito.createUserPool(new CreateUserPoolCommand({ PoolName: "staff" }));
await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "customers" }),
);

const listed = await cognito.listUserPools(
  new ListUserPoolsCommand({ MaxResults: 60 }),
);

console.log(listed.UserPools?.map((pool) => pool.Name));
// [ "staff", "customers" ]
```

Both listings are in creation order and hold at most sixty entries. Follow `NextToken` to read the
rest. A listed pool carries no ARN and a listed app client carries no secret, as real Cognito leaves
those out of a listing.

## Intercepting the SDK client

Code that builds its own `CognitoIdentityProviderClient` needs no changes. Intercepting the client
class routes every Command through simulated Cognito.

```typescript sim-cognito-sdk-interception
/**
 * Intercepting a CognitoIdentityProviderClient into simulated Cognito.
 */

import {
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimSdk } from "@kensio/yulin/sdk";

const simSdk = new SimSdk();
simSdk.intercept(CognitoIdentityProviderClient);

// The code under test uses the AWS SDK as normal.
const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });

const created = await client.send(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const described = await client.send(
  new DescribeUserPoolCommand({ UserPoolId: created.UserPool?.Id }),
);

console.log(described.UserPool?.Id); // "eu-west-2_aBcDeFgHi"

simSdk.restoreAll();
```

The same applies inside a simulated Lambda handler. A client the handler builds is intercepted and
dispatched with the function's execution role as the caller, so the role's policy decides whether the
call succeeds.

## Account and region scoping

A pool belongs to one account and region, as it does on real AWS. A pool id from one scope reaches
nothing in another.

```typescript sim-cognito-scoping
/**
 * A simulated user pool in one Account and Region scope.
 */

import { CreateUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const pool = await simAws
  .account("111111111111")
  .region("eu-west-2")
  .cognitoIdentityProvider()
  .createUserPool(new CreateUserPoolCommand({ PoolName: "myapp-users" }));

console.log(pool.UserPool?.Id); // "eu-west-2_aBcDeFgHi"
console.log(pool.UserPool?.Arn);
// "arn:aws:cognito-idp:eu-west-2:111111111111:userpool/eu-west-2_aBcDeFgHi"
```

## Deletion protection

A pool created through the API is unprotected unless the request asks for protection, which is the
opposite of what the console does. A pool created with `DeletionProtection: "ACTIVE"` refuses
`DeleteUserPool` with `InvalidParameterException`.

Real Cognito wants an `UpdateUserPool` request deactivating the protection before the pool can go.
`UpdateUserPool` is not simulated, so a protected pool cannot be deleted here at all. Create the pool
without `DeletionProtection` if the test needs to delete it.

## Limitations

Current documented limitations:

- There are no users. `AdminCreateUser`, `SignUp`, `AdminGetUser`, `ListUsers` and the rest are not
  implemented, so a pool is a directory with nothing in it. `EstimatedNumberOfUsers` is always zero.
- There are no groups, no tokens and no authentication. `InitiateAuth`, `AdminInitiateAuth`,
  `RespondToAuthChallenge` and `GetTokensFromRefreshToken` are not implemented. An app client's
  `ExplicitAuthFlows` and token lifetimes are stored and reported, and nothing reads them yet.
- Nothing updates a pool or an app client. `UpdateUserPool` and `UpdateUserPoolClient` are not
  implemented, so `LastModifiedDate` is always the creation date.
- A pool with `DeletionProtection: ACTIVE` cannot be deleted at all, because deactivating the
  protection needs `UpdateUserPool`.
- Unsimulated `CreateUserPool` inputs are refused rather than ignored: `UsernameAttributes`,
  `AliasAttributes`, `AutoVerifiedAttributes`, `Schema`, `LambdaConfig`, `UsernameConfiguration`,
  `UserAttributeUpdateSettings`, `DeviceConfiguration`, `AccountRecoverySetting`,
  `AdminCreateUserConfig`, `UserPoolAddOns`, `KeyConfiguration`, `IssuerConfiguration`,
  `UserPoolTags`, the email and SMS configurations, the message templates, an `MfaConfiguration`
  other than `OFF`, a `UserPoolTier` other than `ESSENTIALS`, a `SignInPolicy`, and a
  `PasswordHistorySize`.
- `UsernameAttributes` is worth calling out among those. A pool that signs users in by email or phone
  number stores a generated UUID as the username, so a pool created here without that would answer
  with the wrong username and the right one on real AWS.
- Unsimulated `CreateUserPoolClient` inputs are refused the same way: the OAuth and managed login
  settings (`AllowedOAuthFlows`, `AllowedOAuthScopes`, `CallbackURLs`, `LogoutURLs`,
  `DefaultRedirectURI`, and an `AllowedOAuthFlowsUserPoolClient` of `true`), a
  `SupportedIdentityProviders` naming anything but `COGNITO`, a `ClientSecret` of your own,
  `AnalyticsConfiguration`, `AuthSessionValidity`, `EnablePropagateAdditionalUserContextData`,
  `RefreshTokenRotation`, `ReadAttributes`, `WriteAttributes`, an `EnableTokenRevocation` of `false`,
  and a `PreventUserExistenceErrors` of `ENABLED`.
- A pool does not report `SchemaAttributes`. Real Cognito reports the standard attribute schema on
  every pool, and there are no user attributes here to describe.
- Managed login and the hosted UI are not simulated, and neither are the OAuth endpoints, the
  `/oauth2/token` endpoint among them. Nothing is served over HTTP.
- The JWKS endpoint at `.../.well-known/jwks.json` is not served, because no tokens are signed yet.
- Identity providers, resource servers, user pool domains, MFA configuration, risk configuration and
  Lambda triggers are not simulated.
- Tags are not simulated. `UserPoolTags` is refused, and `TagResource`, `UntagResource` and
  `ListTagsForResource` are not implemented.
- Listings carry no filtering, and are in creation order rather than any order real Cognito chooses.
- `AWS::Cognito::UserPool` and the other `AWS::Cognito::*` CloudFormation resource types are reported
  as unsupported and skipped rather than deployed.
- Cognito is not served as an HTTP API by `serveSimAws`.
- Cognito identity pools are a different service and nothing about them is simulated.
