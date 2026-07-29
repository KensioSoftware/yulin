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
- `AdminCreateUserCommand`, `AdminGetUserCommand`, `AdminDeleteUserCommand`,
  `AdminSetUserPasswordCommand`, `AdminUpdateUserAttributesCommand`, `AdminDisableUserCommand`,
  `AdminEnableUserCommand` and `ListUsersCommand`
- `CreateGroupCommand`, `GetGroupCommand`, `UpdateGroupCommand`, `DeleteGroupCommand`,
  `ListGroupsCommand`, `AdminAddUserToGroupCommand`, `AdminRemoveUserFromGroupCommand`,
  `AdminListGroupsForUserCommand` and `ListUsersInGroupCommand`
- `AdminInitiateAuthCommand` and `AdminRespondToAuthChallengeCommand`, for the
  `ADMIN_USER_PASSWORD_AUTH` and `REFRESH_TOKEN_AUTH` flows and the `NEW_PASSWORD_REQUIRED`
  challenge
- `InitiateAuthCommand` and `RespondToAuthChallengeCommand`, for the client-side
  `USER_PASSWORD_AUTH` and `REFRESH_TOKEN_AUTH` flows, authorized by no IAM policy as they are on
  real Cognito
- `GlobalSignOutCommand` and `AdminUserGlobalSignOutCommand`, which revoke the tokens a user holds
- Real RS256 JWTs, signed by a key the pool publishes as a JWKS, so a verifier configured for the
  pool verifies them unchanged
- Pool ids in the real `<region>_<nine characters>` form, and pool ARNs built from them
- The real default password policy, applied to the passwords users are given
- The real user status lifecycle, so an admin-created user stays in `FORCE_CHANGE_PASSWORD` until it
  has a permanent password
- Group membership, and the precedence order the `cognito:groups` claim uses
- App client authentication flows, token lifetimes, generated client secrets and
  `PreventUserExistenceErrors`
- Refresh tokens that expire at the app client's `RefreshTokenValidity`, thirty days by default on
  the simulated clock
- Authorization of the administrative operations by simulated IAM, against the real IAM action and
  ARN
- Calls made from inside a simulated Lambda handler, authorized as the function's execution role

SRP, the hosted UI and managed login, MFA, custom authentication challenges and device tracking are
not implemented.

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

Every password a user is given is checked against this policy. A password that breaks it is refused
with `InvalidPasswordException`, saying which rule it broke.

## Users

`AdminCreateUser` creates a user in `FORCE_CHANGE_PASSWORD`, which is where real Cognito leaves a
user an admin made: it has a temporary password and cannot sign in with it. Setting a permanent
password moves the user to `CONFIRMED`. The status is what the sign-in flows read: a user in
`FORCE_CHANGE_PASSWORD` gets the `NEW_PASSWORD_REQUIRED` challenge rather than tokens.

```typescript sim-cognito-create-user
/**
 * Creating a simulated user and confirming it.
 */

import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool?.Id;

const created = await cognito.adminCreateUser(
  new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
  }),
);

console.log(created.User?.UserStatus); // "FORCE_CHANGE_PASSWORD"

// Without this the user stays in FORCE_CHANGE_PASSWORD and cannot sign in.
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    Password: "Sup3rSecret!",
    Permanent: true,
  }),
);

const read = await cognito.adminGetUser(
  new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
);

console.log(read.UserStatus); // "CONFIRMED"
console.log(read.UserAttributes?.find((each) => each.Name === "sub")?.Value);
// A UUID, and not "alice"
```

A password set without `Permanent: true` is temporary, and leaves the user in
`FORCE_CHANGE_PASSWORD` again.

A user's `sub` is a UUID Cognito allocates, reported among its attributes. It is not the username,
and code treating the two as interchangeable fails here rather than in a deployment. Admin
operations here name a user by its username only. Real Cognito also accepts a `sub` where an
operation asks for a username, so that is one thing that works there and not here. The refusal says
so when the username given is some user's `sub`.

Attributes come back under `Attributes` from `AdminCreateUser` and `ListUsers`, and under
`UserAttributes` from `AdminGetUser`, which is how the real API names them.

`AdminUpdateUserAttributes` changes the attributes it names and leaves the rest alone.
`AdminDisableUser` sets `Enabled` to `false` without changing the user's status, and
`AdminEnableUser` sets it back.

Only the standard attributes exist. A pool here is created without a `Schema` of its own, so a
`custom:` attribute is refused, as it would be on a real pool created the same way.

## Listing users

`ListUsers` pages by `Limit` and `PaginationToken`, which is what the real operation calls them.

```typescript sim-cognito-list-users
/**
 * Listing the users of a simulated user pool.
 */

import {
  AdminCreateUserCommand,
  CreateUserPoolCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool?.Id;

await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
);
await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "bob" }),
);

const listed = await cognito.listUsers(
  new ListUsersCommand({ UserPoolId: userPoolId }),
);

console.log(listed.Users?.map((user) => user.Username)); // [ "alice", "bob" ]
```

`Filter` is refused rather than ignored. A filter that was quietly dropped would answer with the
wrong users rather than with an error, which is the kind of pass that turns into a failure in a
deployment. List the users and filter them in the test instead.

## Groups

Most authorization code built on Cognito reads `cognito:groups` off a verified token and decides
what the caller may do. Groups are what put a user in that claim.

A group belongs to a pool, holds users, and carries a `Precedence` that decides which of a user's
groups comes first.

```typescript sim-cognito-groups
/**
 * Putting a simulated user in groups, and reading them back by precedence.
 */

import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminListGroupsForUserCommand,
  CreateGroupCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool?.Id;

await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
);

await cognito.createGroup(
  new CreateGroupCommand({
    UserPoolId: userPoolId,
    GroupName: "readers",
    Precedence: 10,
  }),
);
await cognito.createGroup(
  new CreateGroupCommand({
    UserPoolId: userPoolId,
    GroupName: "admins",
    Precedence: 1,
  }),
);

await cognito.adminAddUserToGroup(
  new AdminAddUserToGroupCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    GroupName: "readers",
  }),
);
await cognito.adminAddUserToGroup(
  new AdminAddUserToGroupCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    GroupName: "admins",
  }),
);

const groups = await cognito.adminListGroupsForUser(
  new AdminListGroupsForUserCommand({
    UserPoolId: userPoolId,
    Username: "alice",
  }),
);

console.log(groups.Groups?.map((group) => group.GroupName));
// [ "admins", "readers" ], strongest precedence first
```

Zero is the strongest precedence, not the weakest, and a group created without one is weaker than
any group that has one. `AdminListGroupsForUser` sorts by it, lowest value first, which is the order
the `cognito:groups` claim will use once tokens are simulated. `ListGroups` does not sort: it lists
a pool's groups in creation order.

Adding a user to a group they are already in succeeds and changes nothing, as it does on real
Cognito, so nothing has to check first. Removing a user who was never in the group succeeds too.

Deleting a group takes the membership with it and leaves the users alone. Deleting a user takes them
out of every group, so a group never holds a member the pool cannot describe.

`ListUsersInGroup` reads the membership the other way round, and answers with the same user shape
`ListUsers` does.

`UpdateGroup` replaces the description, the precedence and the role together, so a property the
request leaves out is cleared. Real Cognito does not document whether it replaces or merges here,
and naming every property is the one thing that behaves the same either way.

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
not among them, which is why `USER_PASSWORD_AUTH` fails on a client nobody configured for it, here
and on real AWS.

`PreventUserExistenceErrors` decides what a sign-in naming a user the pool does not hold answers
with. On `ENABLED` it is the `NotAuthorizedException` a wrong password gets, and on `LEGACY` it is
`UserNotFoundException`. The API default is `LEGACY`, which is what a client created here without
the setting gets, and the Cognito console sets `ENABLED` on a client made through it.

Token lifetimes default to an hour for access and ID tokens and thirty days for refresh tokens. The
units are separate inputs, so `AccessTokenValidity: 1` means an hour and `RefreshTokenValidity: 1`
means a day unless `TokenValidityUnits` says otherwise.

The legacy authentication flows (`ADMIN_NO_SRP_AUTH`, `CUSTOM_AUTH_FLOW_ONLY` and
`USER_PASSWORD_AUTH`) work on their own, and a request mixing them with the `ALLOW_` prefixed values
is refused, as real Cognito refuses it. A client holding `ADMIN_NO_SRP_AUTH` can run
`ADMIN_USER_PASSWORD_AUTH` and one holding `USER_PASSWORD_AUTH` can run `USER_PASSWORD_AUTH`, which
is what those settings meant before the `ALLOW_` prefixed ones replaced them.

## Signing in and verifying tokens

`AdminInitiateAuth` runs the `ADMIN_USER_PASSWORD_AUTH` flow and answers with real signed tokens. The
app client has to be created with `ALLOW_ADMIN_USER_PASSWORD_AUTH` among its `ExplicitAuthFlows`, as
it does on real Cognito, and a request against a client without it is refused whatever the password
was.

This is the server-side flow, which needs AWS credentials and the
`cognito-idp:AdminInitiateAuth` permission. The client-side flow a browser or mobile app uses is
`InitiateAuth`, below.

The tokens are RS256 JWTs signed by a key the pool publishes. Hand that JWKS to a verifier and it
verifies them with nothing stubbed and nothing on the network.

```typescript sim-cognito-sign-in
/**
 * Signing a simulated user in, and verifying the token with aws-jwt-verify.
 */

import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
  }),
);
const clientId = appClient.UserPoolClient!.ClientId!;

await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    Password: "Sup3rSecret!",
    Permanent: true,
  }),
);

const { AuthenticationResult } = await cognito.adminInitiateAuth(
  new AdminInitiateAuthCommand({
    UserPoolId: userPoolId,
    ClientId: clientId,
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
  }),
);

// The verifier is the one the application uses, configured as it is there.
const verifier = CognitoJwtVerifier.create({
  userPoolId,
  tokenUse: "access",
  clientId,
});

// The pool's own JWKS, so nothing reaches for the network.
verifier.cacheJwks(cognito.userPool(userPoolId).jwks());

const payload = await verifier.verify(AuthenticationResult!.AccessToken!);

console.log(payload.username); // "alice"
console.log(payload.sub); // a UUID, and not "alice"
```

An `AuthenticationResult` carries an `AccessToken`, an `IdToken`, a `RefreshToken`, an `ExpiresIn` of
3600 and a `TokenType` of `Bearer`. The refresh token is an opaque string rather than a JWT, as it is
on real Cognito, and the pool that issued it is what knows whose it is.

The claim split is the real one. The id token carries `aud`, `token_use: "id"`, `cognito:username`
and the user's attributes. The access token carries `client_id` and no `aud`, `token_use: "access"`,
`username` and a `scope` of `aws.cognito.signin.user.admin`. Both carry the same `sub`, and both
carry `cognito:groups` in precedence order when the user is in any groups. Code reading the wrong
token for a claim fails here the way it would in production.

The `iss` claim is `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`, and the JWT header
names `RS256` and a `kid` the pool's JWKS holds. That is everything a verifier checks.

## The new password challenge

A user an admin created is in `FORCE_CHANGE_PASSWORD` and cannot sign in. Signing in with its
temporary password answers with the `NEW_PASSWORD_REQUIRED` challenge and a session rather than
tokens, and `AdminRespondToAuthChallenge` completes it.

```typescript sim-cognito-new-password-challenge
/**
 * Getting a simulated user past the NEW_PASSWORD_REQUIRED challenge.
 */

import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
  }),
);
const clientId = appClient.UserPoolClient!.ClientId!;

await cognito.adminCreateUser(
  new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    TemporaryPassword: "Temp0rary!",
  }),
);

const challenged = await cognito.adminInitiateAuth(
  new AdminInitiateAuthCommand({
    UserPoolId: userPoolId,
    ClientId: clientId,
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Temp0rary!" },
  }),
);

console.log(challenged.ChallengeName); // "NEW_PASSWORD_REQUIRED"

const signedIn = await cognito.adminRespondToAuthChallenge(
  new AdminRespondToAuthChallengeCommand({
    UserPoolId: userPoolId,
    ClientId: clientId,
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    Session: challenged.Session,
    ChallengeResponses: { USERNAME: "alice", NEW_PASSWORD: "Sup3rSecret!" },
  }),
);

console.log(signedIn.AuthenticationResult?.IdToken?.split(".").length); // 3
```

Name a `TemporaryPassword` on `AdminCreateUser` when the test means to sign the user in. Real Cognito
generates one and emails it, and nothing here delivers a message, so a user created without one has
no password that works.

The new password is checked against the pool's policy and confirms the user, which signs in normally
from then on. A session is single use and lasts three minutes of simulated time, so a replayed one
and one left too long both fail with `NotAuthorizedException`.

A wrong password and a disabled user fail with `NotAuthorizedException` too, saying no more than real
Cognito says. An app client created with `GenerateSecret: true` needs a correct `SECRET_HASH` in
`AuthParameters`, which is the HMAC-SHA256 of the username and client id keyed by the client secret.

## Signing in from a client

`InitiateAuth` is what a browser or mobile app calls. It names the app client and not the pool, and
it needs no AWS credentials and no IAM permission, because real Cognito evaluates no IAM policy for
it. The flow is `USER_PASSWORD_AUTH`, which the app client has to have `ALLOW_USER_PASSWORD_AUTH`
for.

A user that has to change its password gets the `NEW_PASSWORD_REQUIRED` challenge here too, and
`RespondToAuthChallenge` completes it the way `AdminRespondToAuthChallenge` does.

```typescript sim-cognito-client-sign-in
/**
 * Signing in with InitiateAuth, then refreshing the tokens.
 */

import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
  }),
);
const clientId = appClient.UserPoolClient!.ClientId!;

await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    Password: "Sup3rSecret!",
    Permanent: true,
  }),
);

// No pool id, and no caller: the app client id is what finds the pool.
const signedIn = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
  }),
);

// Two hours on, the access token has expired and the refresh token has not.
await simAws.clock().advanceBy({ hours: 2 });

const refreshed = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "REFRESH_TOKEN_AUTH",
    AuthParameters: {
      REFRESH_TOKEN: signedIn.AuthenticationResult!.RefreshToken!,
    },
  }),
);

console.log(refreshed.AuthenticationResult!.IdToken !== undefined); // true
console.log(refreshed.AuthenticationResult!.RefreshToken); // undefined
```

## Refreshing tokens

`REFRESH_TOKEN_AUTH` exchanges a refresh token for a new access token and a new id token. No new
refresh token comes back, as none does on real Cognito with refresh token rotation off, so the
client keeps the one it has until that expires. `REFRESH_TOKEN` is the same flow under its other
name, and both `InitiateAuth` and `AdminInitiateAuth` run it.

The app client has to have `ALLOW_REFRESH_TOKEN_AUTH`, which is one of the flows a client created
without `ExplicitAuthFlows` gets.

A refresh token lasts the app client's `RefreshTokenValidity`, thirty days by default, counted on
the simulated clock. Advancing time past that is what makes a refresh fail with
`NotAuthorizedException`, so a test can exercise the sign-in-again path without waiting a month.

A refresh token belongs to the app client that got it, so presenting one to another client in the
same pool is refused. A refresh for a user that has been disabled or deleted is refused too.

## Signing out

`GlobalSignOut` revokes the tokens a user holds, and is authorized by that user's own access token
rather than by IAM. `AdminUserGlobalSignOut` does the same thing for a user an administrator names,
and does need the `cognito-idp:AdminUserGlobalSignOut` permission on the pool.

After either, the user's refresh tokens are gone, so a `REFRESH_TOKEN_AUTH` request fails and the
user has to sign in again. Signing out does not stop the user signing in: it ends the sessions it
had.

```typescript sim-cognito-sign-out
/**
 * Signing a user out, and the refresh that then fails.
 */

import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";
import { SimCognitoNotAuthorizedException } from "@kensio/yulin/cognito";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
  }),
);
const clientId = appClient.UserPoolClient!.ClientId!;

await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    Password: "Sup3rSecret!",
    Permanent: true,
  }),
);

const signedIn = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
  }),
);

await cognito.globalSignOut(
  new GlobalSignOutCommand({
    AccessToken: signedIn.AuthenticationResult!.AccessToken!,
  }),
);

try {
  await cognito.initiateAuth(
    new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: "REFRESH_TOKEN_AUTH",
      AuthParameters: {
        REFRESH_TOKEN: signedIn.AuthenticationResult!.RefreshToken!,
      },
    }),
  );
} catch (error) {
  // The session is over, so the refresh token no longer buys new tokens.
  console.log(error instanceof SimCognitoNotAuthorizedException); // true
}
```

## Token timestamps and expiry

`iat`, `exp` and `auth_time` come from the simulation's clock rather than the host's, and the tokens
last the hour a pool's tokens last unless the app client says otherwise.

That makes an expired token something a test can produce: sign the user in with the simulated clock
set far enough in the past, and the token a verifier gets is already expired.

```typescript sim-cognito-expired-token
/**
 * Producing a simulated token that a verifier rejects as expired.
 */

import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
  }),
);

await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    Password: "Sup3rSecret!",
    Permanent: true,
  }),
);

// Sign in two hours ago, so the hour the token lasts is already over.
await simAws.clock().setTo(new Date(Date.now() - 2 * 60 * 60 * 1000));

const signedIn = await cognito.adminInitiateAuth(
  new AdminInitiateAuthCommand({
    UserPoolId: userPoolId,
    ClientId: appClient.UserPoolClient!.ClientId!,
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
  }),
);

// A verifier now refuses this token, because its exp has passed.
console.log(signedIn.AuthenticationResult?.ExpiresIn); // 3600
```

Advancing the clock after a sign-in is a different thing. It moves what the simulation calls now, and
the timestamps on tokens issued after it, but a verifier reading the host clock still judges a token
it already holds by host time. Signing in in the past is what produces a token such a verifier
refuses.

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

The client-side operations are the other exception. `InitiateAuth`, `RespondToAuthChallenge` and
`GlobalSignOut` authorize nothing at all, because real Cognito evaluates no IAM policy for them:
they are what an application calls on behalf of a user, holding no AWS credentials. A `caller` is
not read on those three, and the tokens or the app client id are what authorizes them.

That is the difference the two sign-in paths make to a policy. Code calling `AdminInitiateAuth`
needs `cognito-idp:AdminInitiateAuth` on the pool, and code calling `InitiateAuth` needs no policy
statement at all. The same goes for `AdminRespondToAuthChallenge` against `RespondToAuthChallenge`,
and for `AdminUserGlobalSignOut` against `GlobalSignOut`.

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

- Four authentication flows run: `ADMIN_USER_PASSWORD_AUTH` and `REFRESH_TOKEN_AUTH` through
  `AdminInitiateAuth`, and `USER_PASSWORD_AUTH` and `REFRESH_TOKEN_AUTH` through `InitiateAuth`. SRP,
  `USER_AUTH` choice-based sign-in, custom authentication and device tracking are not simulated, and
  an `AuthFlow` naming one of them is refused rather than run as a flow that is.
- `NEW_PASSWORD_REQUIRED` is the only challenge issued, so MFA and custom challenges cannot be
  reached. A `ChallengeName` this simulation does not issue is refused.
- `GetTokensFromRefreshToken` and `RevokeToken` are not implemented, and `RefreshTokenRotation` is
  refused on an app client. Refreshing goes through `REFRESH_TOKEN_AUTH`, which issues no new
  refresh token.
- Signing out revokes the user's tokens inside the simulation, and a token already handed to a
  verifier goes on verifying against the pool's JWKS until it expires. Verification happens in the
  caller's own verifier, which asks this simulation nothing, so nothing here can tell it the token
  was revoked. Real Cognito is the same for a verifier reading only the JWKS.
- The `cognito:preferred_role` and `cognito:roles` claims are not on the tokens. A group's `RoleArn`
  is stored and reported, and nothing assumes that role.
- A pool publishes one signing key where real Cognito publishes two and rotates between them, so
  code assuming a single JWKS entry passes here and is still wrong against real AWS. The key is
  generated with `node:crypto` the first time the pool signs or publishes one, and kept in memory
  for the life of the simulation.
- A password is kept so a user can sign in with it, and nothing reads one back.
- Users are resolved by username only. Real Cognito also accepts a user's `sub` where an admin
  operation asks for a username, and that fails here with `UserNotFoundException`.
- Self-service sign-up is not simulated. `SignUp`, `ConfirmSignUp`, `ForgotPassword`,
  `ChangePassword` and `ResendConfirmationCode` are not implemented, so the `UNCONFIRMED` and
  `RESET_REQUIRED` statuses cannot be reached. `AdminCreateUser` is the only way to make a user.
- No message is ever delivered. `AdminCreateUser` sends no invitation, so `MessageAction: SUPPRESS`
  is accepted and changes nothing, `RESEND` is refused, and `DesiredDeliveryMediums` is refused.
- A temporary password never expires. `TemporaryPasswordValidityDays` is stored on the pool and
  nothing acts on it.
- Unsimulated `AdminCreateUser` inputs are refused rather than ignored: `DesiredDeliveryMediums`,
  `ForceAliasCreation`, `ValidationData`, `ClientMetadata`, and a `MessageAction` of `RESEND`.
  `AdminUpdateUserAttributes` refuses `ClientMetadata` the same way.
- `ListUsers` refuses `Filter` and `AttributesToGet` rather than ignoring them, and lists users in
  creation order. Real Cognito chooses its own order and does not promise one.
- `ListUsers`, `ListGroups`, `AdminListGroupsForUser` and `ListUsersInGroup` refuse a `Limit` of
  zero, which the real operations accept without saying what they return. Refusing it is better than
  guessing between an empty page and a full one.
- Real Cognito does not document the order `AdminListGroupsForUser` returns groups in. Here it is by
  precedence, because that is the order the `cognito:groups` claim uses, and it is what a test
  reading the first group is usually after.
- `UpdateGroup` replaces all three group properties rather than merging, so an omitted one is
  cleared. Real Cognito does not say which it does.
- A group's `RoleArn` is stored and reported, and nothing assumes that role. It reaches the
  `cognito:roles` and `cognito:preferred_role` claims, which are not simulated yet, and identity
  pools, which are not simulated at all.
- Group to IAM role mapping is an identity pool feature and is not simulated.
- Only the standard user attributes exist, because a pool is created without a `Schema`. A `custom:`
  attribute is refused, and so is a request setting `sub`. `AdminDeleteUserAttributes` is not
  implemented, so an attribute can be changed but not removed.
- `EstimatedNumberOfUsers` is how many users the pool holds now. Real Cognito refreshes that number
  periodically rather than on each write, so it can lag there in a way it never does here.
- MFA is not simulated, so `AdminGetUser` reports no `UserMFASettingList`, `PreferredMfaSetting` or
  `MFAOptions`.
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
  `RefreshTokenRotation`, `ReadAttributes`, `WriteAttributes`, and an `EnableTokenRevocation` of
  `false`.
- Unsimulated authentication inputs are refused the same way: `ClientMetadata` and
  `AnalyticsMetadata` on all four operations, `ContextData` on the admin ones, `UserContextData` on
  the client ones, and a `Session` on `InitiateAuth` or `AdminInitiateAuth`, which continues a flow
  neither of them starts.
- A pool does not report `SchemaAttributes`. Real Cognito reports the standard attribute schema on
  every pool, and there are no user attributes here to describe.
- Managed login and the hosted UI are not simulated, and neither are the OAuth endpoints, the
  `/oauth2/token` endpoint among them. Nothing is served over HTTP.
- The JWKS endpoint at `.../.well-known/jwks.json` is not served. A pool's JWKS is read from the
  simulator with `cognito.userPool(userPoolId).jwks()` and handed to a verifier directly.
- Identity providers, resource servers, user pool domains, MFA configuration, risk configuration and
  Lambda triggers are not simulated.
- Tags are not simulated. `UserPoolTags` is refused, and `TagResource`, `UntagResource` and
  `ListTagsForResource` are not implemented.
- Listings carry no filtering, and are in creation order rather than any order real Cognito chooses.
- `AWS::Cognito::UserPool` and the other `AWS::Cognito::*` CloudFormation resource types are reported
  as unsupported and skipped rather than deployed.
- Cognito is not served as an HTTP API by `serveSimAws`.
- Cognito identity pools are a different service and nothing about them is simulated.
