# Simulated Cognito user pools

Yulin includes a simulated Cognito user pool directory for tests and local development. Pools and
their app clients are held in memory, and every operation is authorized by simulated IAM.

Only user pools are simulated. Cognito identity pools, which exchange a token for AWS credentials,
are a different service and are not simulated.

Cognito-specific types are imported from the `@kensio/yulin/cognito` subpath.

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

## Signing up

`SignUp` is the other way a user gets into a pool. It names an app client rather than a pool, is
authorized by no IAM policy, and leaves the user in `UNCONFIRMED` with the password it chose.

Real Cognito emails or texts a confirmation code at that point. Nothing here delivers a message, so
the code is readable from the pool instead, through `confirmationCode` on the pool object. That is a
deliberate divergence: real Cognito never reports a code back to anyone, and reading one is what
makes a registration flow testable at all.

The pool also records the message it would have sent, which is where the wording and the code a user
would have read are. That is in [Messages a pool would have sent](#messages-a-pool-would-have-sent)
below.

```typescript sim-cognito-sign-up
/**
 * Signing a user up and confirming it with the code the pool issued.
 */

import {
  ConfirmSignUpCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    AutoVerifiedAttributes: ["email"],
  }),
);
const userPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
  }),
);
const clientId = appClient.UserPoolClient!.ClientId!;

const signedUp = await cognito.signUp(
  new SignUpCommand({
    ClientId: clientId,
    Username: "alice",
    Password: "Sup3rSecret!",
    UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
  }),
);

console.log(signedUp.UserConfirmed); // false
console.log(signedUp.UserSub); // A UUID, and not "alice"

// Real Cognito sends this to the user and never reports it. Nothing here
// delivers a message, so the pool hands it over instead.
const code = cognito.userPool(userPoolId).confirmationCode("alice");

await cognito.confirmSignUp(
  new ConfirmSignUpCommand({
    ClientId: clientId,
    Username: "alice",
    ConfirmationCode: code,
  }),
);

// The user is CONFIRMED now, and signs in with the password it chose.
const signedIn = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
  }),
);

console.log(signedIn.AuthenticationResult?.AccessToken !== undefined); // true
```

Signing in before confirming is refused with `UserNotConfirmedException`, which real Cognito answers
with even when the password was right, so an application can tell the two apart and send the user to
`ConfirmSignUp`. A wrong password is still refused as any wrong password is, and says nothing about
the account being unconfirmed.

A wrong code is refused with `CodeMismatchException`, and leaves the user unconfirmed holding the
code it was issued, so a second attempt with the right one works. A code is single use, and
confirming spends it.

`ResendConfirmationCode` issues a fresh code and the earlier one stops working, as it does on real
Cognito. A test holding the earlier code has to read the new one from the pool. Asking for a code
for a user that has already confirmed is refused with `InvalidParameterException`.

`AdminConfirmSignUp` confirms a user with no code at all. It names the pool and the user, and is
authorized by IAM the way the other admin operations are.

A pool with a `PreSignUp` trigger can confirm a user at sign-up instead, and one with a
`PostConfirmation` trigger runs it whichever way the user got confirmed. See
"[Lambda triggers](#lambda-triggers)" below.

The pool's `AutoVerifiedAttributes` decide what confirming verifies. A pool created with
`["email"]` has `email_verified` set to `true` on the user when it confirms, because answering with
the code shows the address is the user's. `AdminConfirmSignUp` sets nothing, as it sets nothing on
real Cognito: an admin confirming a user says nothing about whose address it is. Only `email` and
`phone_number` can be verified, and an attribute the user does not have is left alone.

A pool created with `AdminCreateUserConfig: { AllowAdminCreateUserOnly: true }` refuses `SignUp`
with `NotAuthorizedException`, as a real one does. That value is what a CDK `UserPool` without
`selfSignUpEnabled` emits, so a project testing its registration flow gets the same answer here that
the deployed pool would give. A pool created without the setting allows sign-up, which is the AWS
default.

## Messages a pool would have sent

Nothing here delivers an email or a text message. A pool records what it would have sent instead,
and `sentMessages` on the pool object hands the record over. Each message carries the recipient, the
medium, the subject, the body and the occasion it was sent on.

A message is recorded on three occasions: a `SignUp`, a `ResendConfirmationCode`, and an
`AdminCreateUser` that did not ask for `MessageAction: SUPPRESS`. The verification wording is the
pool's own, and `{####}` is replaced with the code the user was issued. A sign-up a `PreSignUp`
handler auto-confirmed records none: that user has no code to answer with, and real Cognito sends it
nothing.

```typescript sim-cognito-sent-messages
/**
 * Reading the verification message a pool would have sent.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    AutoVerifiedAttributes: ["email"],
    EmailVerificationSubject: "Welcome to Acme",
    EmailVerificationMessage: "Your Acme code is {####}",
  }),
);
const userPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
  }),
);

await cognito.signUp(
  new SignUpCommand({
    ClientId: appClient.UserPoolClient!.ClientId!,
    Username: "alice",
    Password: "Sup3rSecret!",
    UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
  }),
);

const [message] = cognito.userPool(userPoolId).sentMessages();

console.log(message?.recipient); // "alice@example.com"
console.log(message?.medium); // "EMAIL"
console.log(message?.subject); // "Welcome to Acme"
console.log(message?.occasion); // "SignUp"

// The placeholder carries the code the user was issued.
const code = cognito.userPool(userPoolId).confirmationCode("alice")!;

console.log(message?.body === `Your Acme code is ${code}`); // true
```

Where the message goes comes from the user's own attributes, as it does on real Cognito. A
verification message goes to an attribute the pool verifies automatically, so a pool created with
`AutoVerifiedAttributes: ["email"]` writes to the user's `email` and a pool that verifies nothing
records no verification message at all. An invitation goes to the user's `email`, or to its
`phone_number` where it has no email address. An email is recorded with a subject and a text message
without one, and a user the pool has no address for is sent nothing.

`AdminCreateUser` records the invitation, carrying the username and the temporary password the
request named, unless the request asked for `MessageAction: SUPPRESS`.

A pool created with no wording of its own uses the wording real Cognito uses: `Your verification
code` and `Your verification code is {####}` for a verification message, and `Your temporary
password` and `Your username is {username} and temporary password is {####}.` for an invitation.
`EmailVerificationMessage`, `EmailVerificationSubject`, `SmsVerificationMessage` and
`VerificationMessageTemplate` are all read, at whatever wording a request sets, held to the two
rules real Cognito holds them to: a message carries `{####}`, and runs to 20,000 characters for an
email and the 140 an SMS carries.

This is Cognito's own delivery record rather than a simulated SES. Real Cognito with the default
`EmailSendingAccount` of `COGNITO_DEFAULT` sends through no other service, and `EmailConfiguration`
and `SmsConfiguration` are refused here, so no pool is configured for a delivery this record would
misrepresent.

### The CustomMessage trigger

A pool with a `CustomMessage` Lambda trigger runs it before the message is recorded, and what the
handler writes into `response.emailSubject`, `response.emailMessage` and `response.smsMessage`
replaces the pool's own wording. The handler writes `request.codeParameter` into its message where
the code belongs, as it does on real Cognito, and the code goes in afterwards.

`triggerSource` names the occasion: `CustomMessage_SignUp`, `CustomMessage_ResendCode` or
`CustomMessage_AdminCreateUser`. The invitation is the one that carries `request.usernameParameter`
as well.

```typescript sim-cognito-custom-message
/**
 * A CustomMessage trigger writing the wording of a verification message.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

/**
 * The part of the CustomMessage event this handler reads and writes.
 */
interface CustomMessageEvent {
  readonly triggerSource: string;
  readonly request: { readonly codeParameter: string };
  response: {
    emailSubject?: string;
    emailMessage?: string;
  };
}

const simAws = new SimAws();
const lambda = simAws.lambda();
const cognito = simAws.cognitoIdentityProvider();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "custom-message",
    Role: "arn:aws:iam::888888888888:role/CustomMessageRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: CustomMessageEvent) => {
        if (event.triggerSource === "CustomMessage_SignUp") {
          event.response.emailSubject = "Welcome to Acme";
          event.response.emailMessage =
            `Your code is ${event.request.codeParameter}. ` +
            `It is good for one sign-up.`;
        }

        return event;
      }),
    },
  }),
);

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    AutoVerifiedAttributes: ["email"],
    LambdaConfig: {
      CustomMessage:
        "arn:aws:lambda:us-east-1:888888888888:function:custom-message",
    },
  }),
);
const userPoolId = pool.UserPool!.Id!;

await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "custom-message",
    StatementId: "AllowCognito",
    Action: "lambda:InvokeFunction",
    Principal: "cognito-idp.amazonaws.com",
    SourceArn: pool.UserPool?.Arn,
  }),
);

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
  }),
);

await cognito.signUp(
  new SignUpCommand({
    ClientId: appClient.UserPoolClient!.ClientId!,
    Username: "alice",
    Password: "Sup3rSecret!",
    UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
  }),
);

const [message] = cognito.userPool(userPoolId).sentMessages();

console.log(message?.subject); // "Welcome to Acme"

// The code parameter the handler wrote carries the real code.
const code = cognito.userPool(userPoolId).confirmationCode("alice")!;

console.log(message?.body.startsWith(`Your code is ${code}.`)); // true
```

A handler that writes nothing leaves the pool's own wording, which is what a handler that only cares
about one occasion does for the others. A handler that throws fails the request with
`UserLambdaValidationException` and leaves the pool with no message, because the trigger runs before
the message is recorded. A `response` that is not an object, or a message in it that is not a
string, fails with `InvalidLambdaResponseException`.

`ClientMetadata` on `SignUp`, `ResendConfirmationCode` and `AdminCreateUser` reaches the handler as
`request.clientMetadata`.

### Reading the messages over HTTP

`serveSimAws` lists a pool's recorded messages at `GET /<userPoolId>/messages`, so they can be read
during local development. Real Cognito serves nothing at that path: it is the serving side of
`sentMessages`, and a divergence for the same reason that accessor is one.

The response is `{ "messages": [ ... ] }`, each message carrying `username`, `recipient`, `medium`,
`subject` where it has one, `body`, `occasion` and an ISO `sentDate`.

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

## Updating an app client

`UpdateUserPoolClient` changes a client's settings, and `DescribeUserPoolClient` reports them along
with a `LastModifiedDate` from when the update happened. A client nothing has updated reports its
creation date there.

```typescript sim-cognito-update-app-client
/**
 * Changing a simulated app client's settings, which replaces them rather than
 * merging into them.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  UpdateUserPoolClientCommand,
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
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
  }),
);

const updated = await cognito.updateUserPoolClient(
  new UpdateUserPoolClientCommand({
    UserPoolId: pool.UserPool?.Id,
    ClientId: appClient.UserPoolClient?.ClientId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    AccessTokenValidity: 5,
    TokenValidityUnits: { AccessToken: "minutes" },
  }),
);

// The next sign-in gets an access token lasting five minutes.
console.log(updated.UserPoolClient?.AccessTokenValidity); // 5
console.log(updated.UserPoolClient?.LastModifiedDate); // when the update ran
```

An update replaces the client's configuration rather than merging into it, which is what real
Cognito does. A setting the request leaves out goes back to the default `CreateUserPoolClient` would
have given it, so the example above repeats `ExplicitAuthFlows` to keep them. A request carrying
only `ClientName` sends the authentication flows back to `ALLOW_REFRESH_TOKEN_AUTH`,
`ALLOW_USER_SRP_AUTH` and `ALLOW_CUSTOM_AUTH`, the token validities back to an hour and thirty days,
and `PreventUserExistenceErrors` back to `LEGACY`.

`ClientName` is the one setting an omitted request keeps rather than resets. A client has to have a
name, and `CreateUserPoolClient` requires one, so there is no default to go back to.

The client's secret is untouched by an update. `UpdateUserPoolClient` has no `GenerateSecret` input
on real Cognito, so a client created without a secret never gains one and a client with one keeps the
same value.

A token already issued keeps the expiry it was issued with, because that expiry was stamped when the
token was handed out. Shortening `AccessTokenValidity` therefore applies to the next sign-in rather
than to a token a test is already holding, as it does on real Cognito. A changed `ExplicitAuthFlows`
takes effect for the next `InitiateAuth`, so removing `ALLOW_USER_PASSWORD_AUTH` starts refusing that
flow.

The inputs `CreateUserPoolClient` refuses are refused here too, in the same words, saying
`UpdateUserPoolClient`.

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

## Signing in through a hosted domain

A pool with a domain serves the OAuth endpoints an authorization code grant runs through, on the
domain's own hostname. That is the only way a user signs in with Google or another external
provider: there is no Cognito API operation that does it, so an application redirects the browser to
the authorize endpoint and exchanges the code it comes back with.

Three things have to be in place. The pool needs a domain, the app client needs the OAuth settings
that say what it may ask for and where the user may be sent back to, and the provider itself has to
be configured.

```typescript sim-cognito-hosted-domain
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
```

A prefix domain is served at `<prefix>.auth.<region>.amazoncognito.com`, and a custom domain, which
is one created with a `CustomDomainConfig`, at the hostname it names. A pool has one domain, and a
domain string is unique across every simulated account and region, as it is across the whole of real
AWS.

### Who is signed in at the provider

Nothing here calls Google. A simulated identity provider holds the user signed in at it instead, and
an authorize request naming that provider signs that user in. The URL the application builds is
therefore the URL it builds in production, and the test says who is at the other end of it:

```typescript sim-cognito-federated-user
/**
 * Saying who is signed in at a simulated identity provider.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
const cognito = simAws.cognitoIdentityProvider();

declare const userPoolId: string;

cognito
  .userPool(userPoolId)
  .auth.identityProviders.require("Google")
  .signInAs({
    Subject: "108412093487519382745",
    Claims: { email: "someone@example.com", given_name: "Someone" },
  });
```

`signInAs` stands in for everything that happens at the provider, which is where a real user types a
password this simulation never sees. An authorize request that reaches a provider nobody is signed
in at is refused, saying so, rather than signing in a user nothing put there. `signOut()` on the
provider puts it back that way.

### Driving the code flow

The browser goes to `/oauth2/authorize`, comes back to the app client's callback URL with a code,
and the application's own server exchanges that code at `/oauth2/token`. Both endpoints are on the
domain's hostname, and `SimAwsHttp` sends a request into the simulation without a server listening.
A domain answers on the real AWS hostname as well as on the localhost one `serveSimAws` rewrites it
to, so the URL an application already builds needs no changing:

```typescript sim-cognito-hosted-sign-in
/**
 * Completing an authorization code grant against a simulated hosted domain.
 */

import { CognitoJwtVerifier } from "aws-jwt-verify";

import type { SimAws } from "@kensio/yulin";
import { SimAwsHttp } from "@kensio/yulin/serve";

declare const simAws: SimAws;
declare const userPoolId: string;
declare const clientId: string;
declare const clientSecret: string;

const http = new SimAwsHttp({ simAws });
const callbackUrl = "https://www.example.com/user/callback";
const hosted = (path: string, query = ""): string =>
  `https://myapp-login.auth.eu-west-2.amazoncognito.com${path}${query}`;

// The browser is sent to the authorize endpoint, naming the provider.
const authorizeQuery = new URLSearchParams({
  response_type: "code",
  client_id: clientId,
  redirect_uri: callbackUrl,
  scope: "openid email",
  state: "csrf-token",
  identity_provider: "Google",
});
const authorized = await http.fetch(
  hosted("/oauth2/authorize", `?${authorizeQuery.toString()}`),
);

console.log(authorized.status); // 302

// It comes back to the callback URL with a code and the state it was given.
const callback = new URL(authorized.headers.get("location")!);
const code = callback.searchParams.get("code")!;
console.log(callback.searchParams.get("state")); // "csrf-token"

// The application's own server exchanges the code, authenticating as the app
// client with its secret.
const exchanged = await http.fetch(hosted("/oauth2/token"), {
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
  },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
  }).toString(),
});

const tokens = (await exchanged.json()) as {
  access_token: string;
  id_token: string;
  refresh_token: string;
  expires_in: number;
};

const verifier = CognitoJwtVerifier.create({
  userPoolId,
  tokenUse: "id",
  clientId,
});
verifier.cacheJwks(
  simAws.cognitoIdentityProvider().userPool(userPoolId).jwks(),
);

const claims = await verifier.verify(tokens.id_token);
console.log(claims["cognito:username"]); // "Google_108412093487519382745"
console.log(claims["email"]); // "someone@example.com"
```

The pool creates a user of its own for each external subject the first time it signs in, exactly as
real Cognito does: the username is the provider name and the subject with an underscore between
them, the status is `EXTERNAL_PROVIDER`, and the provider's claims reach the user through the
provider's attribute mapping. The same subject signing in again reaches the same user, with its
mapped attributes brought up to date. `AdminGetUser` reports where it came from in an `identities`
attribute, and the id token carries the same thing as an `identities` claim.

An authorization code is single use and lasts five minutes on the simulated clock. The token
endpoint also answers a `grant_type` of `refresh_token`, with the refresh token the grant handed
out.

### Signing out

`GET /logout?client_id=...&logout_uri=...` redirects to the sign-out URL, once it has checked it is
one of the app client's `LogoutURLs`. It ends no session, because there is no managed login cookie
here: every authorize request signs in afresh at the identity provider. `GlobalSignOut` and
`AdminUserGlobalSignOut` are what revoke a user's tokens.

### PKCE

An authorize request carrying a `code_challenge` and a `code_challenge_method` of `S256` gets a code
that only the matching `code_verifier` exchanges. `plain` is refused, as it is by real Cognito.

## Lambda triggers

A pool created with a `LambdaConfig` runs the functions it names as part of a sign-up, a sign-in or
a message. Each one is given the real event and has to return it, changed or not.

| Trigger              | Fires                                                                  | `triggerSource`                        |
| -------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| `PreSignUp`          | `SignUp`, before the pool takes the new user                           | `PreSignUp_SignUp`                     |
| `PreSignUp`          | `AdminCreateUser`, before the pool takes the new user                  | `PreSignUp_AdminCreateUser`            |
| `PostConfirmation`   | `ConfirmSignUp` and `AdminConfirmSignUp`, once the user is `CONFIRMED` | `PostConfirmation_ConfirmSignUp`       |
| `PreAuthentication`  | a sign-in, once the user is known and before its password is checked   | `PreAuthentication_Authentication`     |
| `PreTokenGeneration` | a sign-in, where the claims of its tokens are settled                  | `TokenGeneration_Authentication`       |
| `PreTokenGeneration` | the sign-in that finishes by answering the new password challenge      | `TokenGeneration_NewPasswordChallenge` |
| `PreTokenGeneration` | a `REFRESH_TOKEN_AUTH` refresh, over the tokens it reissues            | `TokenGeneration_RefreshTokens`        |
| `PostAuthentication` | a sign-in, once the tokens have been issued                            | `PostAuthentication_Authentication`    |
| `CustomMessage`      | `SignUp`, before the verification message is recorded                  | `CustomMessage_SignUp`                 |
| `CustomMessage`      | `ResendConfirmationCode`, before the message is recorded               | `CustomMessage_ResendCode`             |
| `CustomMessage`      | `AdminCreateUser`, before the invitation is recorded                   | `CustomMessage_AdminCreateUser`        |

`CustomMessage` is the one whose response is read for more than a flag, and it is covered in
[The CustomMessage trigger](#the-custommessage-trigger) above. The rest are here.

The function is a simulated Lambda function anywhere in the simulation, and it has to admit
`cognito-idp.amazonaws.com` for the pool, which is what `AddPermission` grants and what CDK's
`addTrigger` emits an `AWS::Lambda::Permission` for.

### Sign-up triggers

`PreSignUp` runs before the pool takes the new user, so a handler that throws refuses the sign-up
with `UserLambdaValidationException` and leaves no user behind. `PostConfirmation` runs once the
user has reached `CONFIRMED`, and is given its attributes with the `sub` the pool allocated among
them, which is what a handler keys an external record on.

The handler runs as its function's execution role, so a call it makes to another simulated service
is authorized by simulated IAM the way the deployed function's would be.

```typescript sim-cognito-sign-up-triggers
/**
 * A user pool that auto-confirms its users and writes each one to DynamoDB.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

/**
 * The parts of the two sign-up events these handlers read.
 */
interface SignUpTriggerEvent {
  readonly userName: string;
  readonly request: { readonly userAttributes: Record<string, string> };
  readonly response: {
    autoConfirmUser?: boolean;
    autoVerifyEmail?: boolean;
  };
}

const simAws = new SimAws();
const lambda = simAws.lambda();
const cognito = simAws.cognitoIdentityProvider();

await simAws.dynamoDb().createTable(
  new CreateTableCommand({
    TableName: "users",
    KeySchema: [{ AttributeName: "sub", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "sub", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);

// The execution role is what the handler's own writes are authorized as, so a
// missing grant fails the confirmation rather than writing nothing.
const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "SignUpTriggerRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "SignUpTriggerRole",
    PolicyName: "WriteUsers",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "dynamodb:PutItem",
        Resource: `arn:aws:dynamodb:${simAws.defaultRegionName}:${simAws.defaultAccountId}:table/users`,
      },
    }),
  }),
);

// Anyone on the domain the pool is for skips confirmation, and their address
// counts as verified without a code ever being answered.
await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "pre-sign-up",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SignUpTriggerEvent) => {
        const email = event.request.userAttributes["email"] ?? "";

        if (email.endsWith("@example.com")) {
          event.response.autoConfirmUser = true;
          event.response.autoVerifyEmail = true;
        }

        return event;
      }),
    },
  }),
);

// The confirmed user gets a row of its own, keyed on the sub Cognito
// allocated rather than on the username.
await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "post-confirmation",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput(async (event: SignUpTriggerEvent) => {
        await simAws.dynamoDb().putItem(
          new PutItemCommand({
            TableName: "users",
            Item: {
              sub: { S: event.request.userAttributes["sub"] ?? "" },
              email: { S: event.request.userAttributes["email"] ?? "" },
              username: { S: event.userName },
            },
          }),
        );

        return event;
      }),
    },
  }),
);

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    LambdaConfig: {
      PreSignUp: `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:pre-sign-up`,
      PostConfirmation: `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:post-confirmation`,
    },
  }),
);

for (const functionName of ["pre-sign-up", "post-confirmation"]) {
  await lambda.addPermission(
    new AddPermissionCommand({
      FunctionName: functionName,
      StatementId: "AllowCognito",
      Action: "lambda:InvokeFunction",
      Principal: "cognito-idp.amazonaws.com",
      SourceArn: pool.UserPool?.Arn,
    }),
  );
}

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: pool.UserPool?.Id,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
  }),
);

const signedUp = await cognito.signUp(
  new SignUpCommand({
    ClientId: appClient.UserPoolClient?.ClientId,
    Username: "alice",
    Password: "Sup3rSecret!",
    UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
  }),
);

// The pre sign-up handler confirmed the user, so no ConfirmSignUp call is
// needed and the post confirmation handler has already run.
console.log(signedUp.UserConfirmed); // true

const written = await simAws.dynamoDb().getItem(
  new GetItemCommand({
    TableName: "users",
    Key: { sub: { S: signedUp.UserSub ?? "" } },
  }),
);

console.log(written.Item?.["email"]?.S); // "alice@example.com"
```

A `PreSignUp` handler answers in the `response` it is given, which arrives with `autoConfirmUser`,
`autoVerifyEmail` and `autoVerifyPhone` all set to `false`. Setting `autoConfirmUser` takes the new
user straight to `CONFIRMED`, and `SignUp` reports `UserConfirmed: true`. The two verify flags set
`email_verified` and `phone_number_verified` without a code being answered, and work whether or not
the user was confirmed. Asking to verify an attribute the sign-up did not carry refuses the sign-up,
as it does on real Cognito, rather than creating a user with the flag quietly unset.

A user confirmed that way still reaches `PostConfirmation`, at sign-up rather than at a
`ConfirmSignUp` that never comes. A project whose users never confirm is covered by that, here as on
real Cognito.

`AdminCreateUser` reaches `PreSignUp` and never reaches `PostConfirmation`. That matters more than
it looks: `AdminCreateUser` is the obvious place to hang the trigger and the wrong one, and a
project relying on it would pass here and write nothing in production. What the handler wrote into
the response is ignored on that occasion too, because an admin-created user is already past
confirmation. Real Cognito ignores all three flags there.

The `ValidationData` and `ClientMetadata` a request carries reach the handler. `SignUp` and
`AdminCreateUser` pass both to `PreSignUp`, as `request.validationData` and
`request.clientMetadata`. `ConfirmSignUp` and `AdminConfirmSignUp` pass their `ClientMetadata` to
`PostConfirmation`. Neither is stored on the user, as neither is on real Cognito.

The admin operations have no app client to name, so a handler fired by `AdminCreateUser` or
`AdminConfirmSignUp` reads `callerContext.clientId` as `CLIENT_ID_NOT_APPLICABLE`, which is what
real Cognito sends.

### Sign-in triggers

`PreAuthentication` runs once the user is known and before its password is checked, so a wrong
password reaches it too: the trigger is given the user to decide about, and deciding is what it is
for. `PostAuthentication` runs once the tokens have been issued.

```typescript sim-cognito-lambda-triggers
/**
 * A user pool that runs a PreAuthentication trigger on every sign-in.
 */

import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

/**
 * The part of the PreAuthentication event this handler reads.
 */
interface PreAuthenticationEvent {
  readonly request: { readonly userAttributes: Record<string, string> };
}

const simAws = new SimAws();
const lambda = simAws.lambda();
const cognito = simAws.cognitoIdentityProvider();

// The trigger turns away anyone who is not on the domain the pool is for, and
// hands the event back otherwise, as every trigger handler has to.
await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "pre-auth",
    Role: "arn:aws:iam::888888888888:role/PreAuthRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: PreAuthenticationEvent) => {
        const email = event.request.userAttributes["email"] ?? "";

        if (!email.endsWith("@example.com")) {
          throw new Error("Only example.com may sign in");
        }

        return event;
      }),
    },
  }),
);

// The pool names the function by ARN. Nothing is resolved until a sign-in runs
// the trigger, so the pool can be created before the function exists.
const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    LambdaConfig: {
      PreAuthentication:
        "arn:aws:lambda:us-east-1:888888888888:function:pre-auth",
    },
  }),
);

// Cognito invokes the function as a service, so the function's resource policy
// has to admit it for this pool.
await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "pre-auth",
    StatementId: "AllowCognito",
    Action: "lambda:InvokeFunction",
    Principal: "cognito-idp.amazonaws.com",
    SourceArn: pool.UserPool?.Arn,
  }),
);

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: pool.UserPool?.Id,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
  }),
);

await cognito.adminCreateUser(
  new AdminCreateUserCommand({
    UserPoolId: pool.UserPool?.Id,
    Username: "mallory",
    UserAttributes: [{ Name: "email", Value: "mallory@elsewhere.test" }],
  }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId: pool.UserPool?.Id,
    Username: "mallory",
    Password: "Sup3rSecretPassw0rd!",
    Permanent: true,
  }),
);

try {
  await cognito.adminInitiateAuth(
    new AdminInitiateAuthCommand({
      UserPoolId: pool.UserPool?.Id,
      ClientId: appClient.UserPoolClient?.ClientId,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: "mallory",
        PASSWORD: "Sup3rSecretPassw0rd!",
      },
    }),
  );
} catch (error) {
  // The handler's own words, in the error real Cognito refuses the sign-in
  // with.
  console.log((error as Error).name); // "UserLambdaValidationException"
  console.log((error as Error).message);
  // "PreAuthentication failed with error Only example.com may sign in."
}
```

`ClientMetadata` on the sign-in reaches the handler as `request.validationData` for
`PreAuthentication` and as `request.clientMetadata` for `PostAuthentication`, as it does on real
Cognito. Neither fires for `REFRESH_TOKEN_AUTH`, as neither does on real Cognito, where
`PreTokenGeneration` does.

### The event, and what a failure gets back

Every event carries `version`, `region`, `userPoolId`, `userName`, the `triggerSource` naming the
occasion, a `callerContext` naming the app client, and the `request` and `response` pair. The
`request` holds `userAttributes` as a plain object of strings rather than the `Name`/`Value` pairs
the API answers with.

`sub` is among those attributes everywhere except `PreSignUp`, where the user does not exist yet: on
real Cognito the sub is allocated once the sign-up has got past that handler. A handler keying an
external record on `sub` has to be a `PostConfirmation` one, here as there.

Three failures are reported the way real Cognito reports them:

- A handler that throws fails the request with `UserLambdaValidationException`, carrying the message
  it threw. For `PreSignUp` and `PreAuthentication` that is how the trigger turns the request down.
- A trigger naming a function that is not there, or one whose resource policy does not admit
  `cognito-idp.amazonaws.com` for the pool, fails with `UnexpectedLambdaException`.
- A handler that returns something other than the event it was given fails with
  `InvalidLambdaResponseException`.

Only the triggers in the table above run. Every other `LambdaConfig` key is refused when the pool is
created or updated, naming the trigger, so a pool never quietly drops one.

## Custom claims from a token trigger

`PreTokenGeneration` decides what the pool puts on a token. The handler writes
`response.claimsOverrideDetails`, and the id token is signed with what it asked for.
`claimsToAddOrOverride` adds or replaces a claim, `claimsToSuppress` removes one, and
`groupOverrideDetails.groupsToOverride` replaces the `cognito:groups` claim. The group override
reaches the access token too, which is the one change a `V1_0` trigger makes to one.

```typescript sim-cognito-pre-token-generation
/**
 * A user pool whose token trigger puts a tenant on every id token.
 */

import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import { CognitoJwtVerifier } from "aws-jwt-verify";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

/**
 * The part of the PreTokenGeneration event this handler reads and writes.
 */
interface PreTokenGenerationEvent {
  readonly request: { readonly userAttributes: Record<string, string> };
  readonly response: object;
}

const simAws = new SimAws();
const lambda = simAws.lambda();
const cognito = simAws.cognitoIdentityProvider();

// The trigger reads the user's email and puts the tenant it belongs to on the
// token, along with the groups that tenant's users get.
await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "pre-token",
    Role: "arn:aws:iam::888888888888:role/PreTokenRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: PreTokenGenerationEvent) => {
        const email = event.request.userAttributes["email"] ?? "";

        return {
          ...event,
          response: {
            claimsOverrideDetails: {
              claimsToAddOrOverride: { tenantId: email.split("@", 2)[1] ?? "" },
              claimsToSuppress: ["email"],
              groupOverrideDetails: { groupsToOverride: ["tenant-admin"] },
            },
          },
        };
      }),
    },
  }),
);

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    LambdaConfig: {
      PreTokenGeneration:
        "arn:aws:lambda:us-east-1:888888888888:function:pre-token",
    },
  }),
);
const userPoolId = pool.UserPool!.Id!;

await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "pre-token",
    StatementId: "AllowCognito",
    Action: "lambda:InvokeFunction",
    Principal: "cognito-idp.amazonaws.com",
    SourceArn: pool.UserPool!.Arn!,
  }),
);

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
    UserAttributes: [{ Name: "email", Value: "alice@acme.example" }],
  }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    Password: "Sup3rSecretPassw0rd!",
    Permanent: true,
  }),
);

const signedIn = await cognito.adminInitiateAuth(
  new AdminInitiateAuthCommand({
    UserPoolId: userPoolId,
    ClientId: clientId,
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecretPassw0rd!" },
  }),
);

// The overridden token is signed like any other, so the application's own
// verifier is what reads the claims off it.
const verifier = CognitoJwtVerifier.create({
  userPoolId,
  tokenUse: "id",
  clientId,
});

verifier.cacheJwks(cognito.userPool(userPoolId).jwks());

const payload = await verifier.verify(signedIn.AuthenticationResult!.IdToken!);

// The claim the handler added is there, and the one it suppressed is not.
console.log(payload["tenantId"]); // "acme.example"
console.log(payload["email"]); // undefined
console.log(payload["cognito:groups"]); // ["tenant-admin"]
```

The trigger runs wherever the pool issues tokens, and names the occasion in `triggerSource`:
`TokenGeneration_Authentication` for a sign-in, `TokenGeneration_NewPasswordChallenge` for the
sign-in that finishes by answering the new password challenge, and `TokenGeneration_RefreshTokens`
for `REFRESH_TOKEN_AUTH`. A refresh runs the handler again, so a claim that changed since the
sign-in is on the reissued token rather than being stale for the life of the session.

The request the handler is given carries `userAttributes`, a `groupConfiguration.groupsToOverride`
holding the groups the user is in, and, from a challenge response, `clientMetadata`. Real Cognito
passes `ClientMetadata` to this trigger from `RespondToAuthChallenge` and
`AdminRespondToAuthChallenge` only, and not from `InitiateAuth` or `AdminInitiateAuth`.

A response naming something this simulation would have to drop is refused with
`InvalidLambdaResponseException` rather than applied in part:

- A reserved claim in `claimsToAddOrOverride` or `claimsToSuppress`, such as `sub`, `aud`, `iss`,
  `token_use`, `exp`, `iat` or `auth_time`. Real Cognito ignores an override of one, so a handler
  that appeared to work here would do nothing deployed.
- Any `cognito:` claim in `claimsToAddOrOverride`. `cognito:groups` is changed through
  `groupOverrideDetails` instead, and the refusal says so.
- `groupOverrideDetails.iamRolesToOverride` or `preferredRole`, because the `cognito:roles` and
  `cognito:preferred_role` claims they feed are not issued here at all.
- A claim value that is not a string. Complex claim values arrived with the `V2_0` event, which is
  not simulated.

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

## Deploying a pool from CloudFormation

`AWS::Cognito::UserPool`, `AWS::Cognito::UserPoolClient` and
`AWS::Cognito::UserPoolGroup` deploy into simulated Cognito, so a stack that already declares a pool
does not have to be duplicated in SDK calls to be tested.

```typescript sim-cognito-cloudformation
/**
 * Deploying a user pool, an app client and a group from a template.
 */

import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "app-stack",
  template: {
    Resources: {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: {
          UserPoolName: "myapp-users",
          Policies: { PasswordPolicy: { MinimumLength: 12 } },
        },
      },
      AppClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: {
          UserPoolId: { Ref: "AppPool" },
          ClientName: "web",
          ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
        },
      },
      AdminsGroup: {
        Type: "AWS::Cognito::UserPoolGroup",
        Properties: {
          UserPoolId: { Ref: "AppPool" },
          GroupName: "admins",
          Precedence: 0,
        },
      },
    },
    Outputs: {
      UserPoolId: { Value: { Ref: "AppPool" } },
      ClientId: { Value: { Ref: "AppClient" } },
      ProviderUrl: { Value: { "Fn::GetAtt": ["AppPool", "ProviderURL"] } },
    },
  },
});
await stack.waitForDeployComplete();

const userPoolId = stack.outputs.get("UserPoolId")?.value as string;
const clientId = stack.outputs.get("ClientId")?.value as string;

console.log(userPoolId); // "eu-west-2_aBcDeFgHi"
console.log(stack.outputs.get("ProviderUrl")?.value);
// "https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_aBcDeFgHi"

// The deployed pool, client and group are what the test then works with.
const cognito = simAws.cognitoIdentityProvider();

await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    Password: "Sup3rSecretPassw0rd!",
    Permanent: true,
  }),
);
await cognito.adminAddUserToGroup(
  new AdminAddUserToGroupCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    GroupName: "admins",
  }),
);

// The sign-in runs through the flow the template opened on the app client.
const { AuthenticationResult } = await cognito.adminInitiateAuth(
  new AdminInitiateAuthCommand({
    UserPoolId: userPoolId,
    ClientId: clientId,
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecretPassw0rd!" },
  }),
);

console.log(AuthenticationResult?.AccessToken !== undefined); // true
```

`Ref` and `Fn::GetAtt` answer what real CloudFormation answers:

| Resource type                  | `Ref`      | `Fn::GetAtt`                                       |
| ------------------------------ | ---------- | -------------------------------------------------- |
| `AWS::Cognito::UserPool`       | pool id    | `Arn`, `ProviderName`, `ProviderURL`, `UserPoolId` |
| `AWS::Cognito::UserPoolClient` | client id  | `ClientId`                                         |
| `AWS::Cognito::UserPoolGroup`  | group name | none                                               |

`ProviderName` is `cognito-idp.<region>.amazonaws.com/<userPoolId>` and `ProviderURL` is the same
with an `https://` prefix, which is also the `iss` claim of the tokens the pool issues.

An app client publishes no `ClientSecret` attribute, because real CloudFormation publishes none. Read
the secret with `DescribeUserPoolClient`, which reports it here as it does on real Cognito.

The properties each type reads are the ones this simulation models:

- `AWS::Cognito::UserPool`: `UserPoolName`, `Policies`, `DeletionProtection`, `LambdaConfig`,
  `AdminCreateUserConfig`, `AutoVerifiedAttributes`, `MfaConfiguration`, `UserPoolTier`,
  `AccountRecoverySetting`, `EmailVerificationMessage`, `EmailVerificationSubject`,
  `SmsVerificationMessage` and `VerificationMessageTemplate`. `LambdaConfig` is read a trigger at a
  time, so a template naming a trigger this simulation runs deploys and one naming a trigger it
  does not fails the stack. The last six are accepted at one value each and refused at any other,
  as `CreateUserPool` refuses them.
- `AWS::Cognito::UserPoolClient`: `UserPoolId`, `ClientName`, `GenerateSecret`, `ExplicitAuthFlows`,
  `PreventUserExistenceErrors`, `AccessTokenValidity`, `IdTokenValidity`, `RefreshTokenValidity`,
  `TokenValidityUnits`, `AllowedOAuthFlowsUserPoolClient`, `AllowedOAuthFlows`,
  `AllowedOAuthScopes`, `CallbackURLs`, `LogoutURLs`, `DefaultRedirectURI` and
  `SupportedIdentityProviders`.
- `AWS::Cognito::UserPoolGroup`: `UserPoolId`, `GroupName`, `Description`, `Precedence` and
  `RoleArn`.
- `AWS::Cognito::UserPoolDomain`: `UserPoolId`, `Domain`, `CustomDomainConfig` and
  `ManagedLoginVersion`. `Ref` returns the domain string, and `Fn::GetAtt CloudFrontDistribution`
  the distribution name, which only a custom domain has.
- `AWS::Cognito::UserPoolIdentityProvider`: `UserPoolId`, `ProviderName`, `ProviderType`,
  `ProviderDetails`, `AttributeMapping` and `IdpIdentifiers`. `Ref` returns the provider name.

Any other property is left out of what is created and recorded in
[`stack.ignoredProperties`](../cloudformation/README.md#properties-a-resource-was-created-without),
naming the logical id, the property and the ones this can act on instead. The pool or client is
created either way, so a stack full of Cognito resources deploys and the record says which of them
behaves differently to the template. A stack that forgets `ALLOW_ADMIN_USER_PASSWORD_AUTH` still
fails at the sign-in here as it would in a deployment, which is the point of deploying the template
rather than restating it.

`UserPoolName` and `ClientName` are optional. A template that sets neither gets
`<stack name>-<logical id>`, as real CloudFormation generates a name, trimmed to the 128 characters
Cognito allows if the two are longer than that together. Real CloudFormation adds random characters
on the end and this does not, so the name is the same on every deployment of the same template and a
test can assert it.

## Properties accepted without being simulated

A CDK `UserPool` construct emits six properties on `AWS::Cognito::UserPool` before it has been asked
for anything, and a client created with `disableOAuth` emits two on `AWS::Cognito::UserPoolClient`.
Most of them are simulated: `AdminCreateUserConfig` decides whether `SignUp` works against the pool,
and the four verification wording properties are what a recorded message says.

`AccountRecoverySetting` is the one that is not. There is no `ForgotPassword` here, so no recovery
mechanism is ever reached, and it is accepted at one value and no other so that a CDK stack deploys
as it stands. The two app client properties are accepted the same way.

```typescript sim-cognito-cdk-defaults
/**
 * Deploying the Resources a CDK UserPool construct emits by default.
 */

import { DescribeUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

const verificationMessage =
  "The verification code to your new account is {####}";

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "app-stack",
  template: {
    Resources: {
      // What `new cognito.UserPool(stack, "Pool")` synthesizes, with no
      // UserPoolName among it.
      Pool: {
        Type: "AWS::Cognito::UserPool",
        Properties: {
          AccountRecoverySetting: {
            RecoveryMechanisms: [
              { Name: "verified_phone_number", Priority: 1 },
              { Name: "verified_email", Priority: 2 },
            ],
          },
          AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
          EmailVerificationMessage: verificationMessage,
          EmailVerificationSubject: "Verify your new account",
          SmsVerificationMessage: verificationMessage,
          VerificationMessageTemplate: {
            DefaultEmailOption: "CONFIRM_WITH_CODE",
            EmailMessage: verificationMessage,
            EmailSubject: "Verify your new account",
            SmsMessage: verificationMessage,
          },
        },
      },
      // What `pool.addClient("Client", { disableOAuth: true })` synthesizes.
      PoolClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: {
          UserPoolId: { Ref: "Pool" },
          AllowedOAuthFlowsUserPoolClient: false,
          SupportedIdentityProviders: ["COGNITO"],
        },
      },
    },
    Outputs: { PoolId: { Value: { Ref: "Pool" } } },
  },
});
await stack.waitForDeployComplete();

const userPoolId = stack.outputs.get("PoolId")?.value as string;

// The pool is named after the stack and the logical id, as the template named
// neither it nor the client.
const described = await simAws
  .cognitoIdentityProvider()
  .describeUserPool(new DescribeUserPoolCommand({ UserPoolId: userPoolId }));

console.log(described.UserPool?.Name); // "app-stack-Pool"

// What the template declared is reported back. This one is acted on: it is
// what says only an admin creates users in this pool.
console.log(described.UserPool?.AdminCreateUserConfig);
// { AllowAdminCreateUserOnly: true }

// So is this one: it is what a verification message the pool records says.
console.log(described.UserPool?.EmailVerificationSubject);
// "Verify your new account"
```

The accepted value of each is below. A pool or a client created without one of these reports it not
at all, rather than reporting the value it would have had to use.

| Property                          | Accepted value                                                             |
| --------------------------------- | -------------------------------------------------------------------------- |
| `AccountRecoverySetting`          | `verified_phone_number` at priority 1, then `verified_email` at priority 2 |
| `AllowedOAuthFlowsUserPoolClient` | `false`                                                                    |
| `SupportedIdentityProviders`      | `["COGNITO"]`                                                              |

Every key of `AccountRecoverySetting` is compared, so an object carrying one the accepted value does
not have is refused along with everything else that differs. The refusal names the property, the
value asked for and the value that is simulated.

`VerificationMessageTemplate` is read rather than compared, and the one thing refused in it is
`DefaultEmailOption: CONFIRM_WITH_LINK`, along with `EmailMessageByLink` and `EmailSubjectByLink`.
Nothing here serves a link, and `ConfirmSignUp` with the code is the only way a user is confirmed, so
a pool that asked for a link would be tested against a flow it does not have in a deployment.

## Serving a pool's JWKS on localhost

`serveSimAws` serves the two public endpoints of every simulated pool:

- `GET /<userPoolId>/.well-known/jwks.json`
- `GET /<userPoolId>/.well-known/openid-configuration`

It also lists the messages a pool would have sent, at `GET /<userPoolId>/messages`, which real
Cognito serves nothing at. That one is anonymous too, and it hands out confirmation codes and
temporary passwords to anyone who asks, so serve a simulation on a port other people can reach only
if you mean to.

The two real endpoints are anonymous as they are on real Cognito, so no SigV4 signature is needed to
fetch them. The real hostname `cognito-idp.<region>.amazonaws.com` maps to
`cognito-idp.<region>.sim-aws.localhost`, and `srv.localUrl(...)` does that rewriting for you. An
unknown pool id gets a 404, as does a pool reached through another region's hostname.

```typescript sim-cognito-serve-jwks
/**
 * Fetching a simulated user pool's JWKS over HTTP.
 */

import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { Jwks } from "aws-jwt-verify/jwk";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
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

const srv = await serveSimAws({ simAws });

try {
  // The real Cognito JWKS URL, adapted for the local server.
  const jwksUrl = srv.localUrl(
    `https://cognito-idp.eu-west-2.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
  );
  console.log(jwksUrl.pathname);
  // "/eu-west-2_aBcDeFgHi/.well-known/jwks.json"

  const response = await fetch(jwksUrl);
  const jwks = (await response.json()) as Jwks;

  const verifier = CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: "access",
    clientId,
  });
  verifier.cacheJwks(jwks);

  const payload = await verifier.verify(AuthenticationResult!.AccessToken!);

  console.log(payload.username); // "alice"
} finally {
  await srv.close();
}
```

`aws-jwt-verify` fetches over HTTPS only, and `CognitoJwtVerifier` builds its own JWKS URI from the
pool id rather than taking one, so it cannot be pointed at the local URL. Fetching the document and
calling `cacheJwks` with it is one way round that. The other is to hand the verifier a
`SimpleJwksCache` from `aws-jwt-verify/jwk` whose fetcher passes the URI through `srv.localUrl`,
which leaves the verifier setup in the application untouched. A verifier that takes a `jwksUri` and
accepts plain HTTP can be pointed at the local URL as it is.

The OpenID configuration names the origin the request arrived on in `issuer` and `jwks_uri`, so a
client that discovers the document can go on to fetch the keys it points at. The tokens keep the
real `https://cognito-idp.<region>.amazonaws.com/<userPoolId>` in `iss`, which is what a verifier
built from a pool id checks against, so the two disagree here where they agree on real Cognito.

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

## Updating a pool

`UpdateUserPool` changes a pool's password policy, deletion protection, auto-verified attributes,
Lambda triggers and `AdminCreateUserConfig.AllowAdminCreateUserOnly`.

It replaces those settings rather than merging into them, as real Cognito does. A setting the
request leaves out goes back to the default `CreateUserPool` would have given it, so a request that
names only the one setting it wants to change resets the others. Name every setting the pool should
keep. That is the sharp edge on real Cognito too, and a request written that way behaves the same
here and in a deployment.

A pool's `LambdaConfig` is replaced the same way, so an update that says nothing about it stops the
pool running the triggers it was created with, as real Cognito would.

The pool's name is not among the settings an update carries. Real `UpdateUserPool` renames a pool
with `PoolName`, and a rename is not simulated, so a request carrying one is refused. Every other
input `CreateUserPool` refuses is refused here too, in the same words, saying `UpdateUserPool`.

`UpdateUserPool` answers with nothing but the response metadata, as the real operation does, so
`DescribeUserPool` is what reads the change back.

```typescript sim-cognito-update-user-pool
/**
 * Changing a simulated user pool's settings.
 */

import {
  CreateUserPoolCommand,
  DeleteUserPoolCommand,
  DescribeUserPoolCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const cognito = new SimAws().cognitoIdentityProvider();

const created = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    DeletionProtection: "ACTIVE",
    Policies: { PasswordPolicy: { MinimumLength: 12 } },
  }),
);

const UserPoolId = created.UserPool?.Id;

await cognito.updateUserPool(
  new UpdateUserPoolCommand({ UserPoolId, DeletionProtection: "INACTIVE" }),
);

const described = await cognito.describeUserPool(
  new DescribeUserPoolCommand({ UserPoolId }),
);

console.log(described.UserPool?.DeletionProtection); // "INACTIVE"

// The update said nothing about the password policy, so it is back at the
// default rather than the twelve characters the pool was created with.
console.log(described.UserPool?.Policies?.PasswordPolicy?.MinimumLength); // 8

// The pool can be deleted now its protection is off.
await cognito.deleteUserPool(new DeleteUserPoolCommand({ UserPoolId }));
```

A pool reports the time of its last update as its `LastModifiedDate`, in `DescribeUserPool` and in
`ListUserPools`. A pool that has never been updated reports its creation date as its
`LastModifiedDate`.

## Deletion protection

A pool created through the API is unprotected unless the request asks for protection, which is the
opposite of what the console does. A pool created with `DeletionProtection: "ACTIVE"` refuses
`DeleteUserPool` with `InvalidParameterException`.

Real Cognito wants an `UpdateUserPool` request deactivating the protection before the pool can go,
and so does this. Send an `UpdateUserPool` with `DeletionProtection: "INACTIVE"` first, then delete
the pool.

## Available functionality

Sim Cognito currently supports:

- `CreateUserPoolCommand`, `DescribeUserPoolCommand`, `UpdateUserPoolCommand`,
  `DeleteUserPoolCommand` and `ListUserPoolsCommand`
- `CreateUserPoolClientCommand`, `DescribeUserPoolClientCommand`, `UpdateUserPoolClientCommand`,
  `DeleteUserPoolClientCommand` and `ListUserPoolClientsCommand`
- `AdminCreateUserCommand`, `AdminGetUserCommand`, `AdminDeleteUserCommand`,
  `AdminSetUserPasswordCommand`, `AdminUpdateUserAttributesCommand`, `AdminDisableUserCommand`,
  `AdminEnableUserCommand` and `ListUsersCommand`
- `SignUpCommand`, `ConfirmSignUpCommand` and `ResendConfirmationCodeCommand`, authorized by no IAM
  policy as they are on real Cognito, and `AdminConfirmSignUpCommand`, which is authorized like the
  other admin operations
- The `PreSignUp` and `PostConfirmation` Lambda triggers, with `autoConfirmUser`, `autoVerifyEmail`
  and `autoVerifyPhone` applied, and with the `ValidationData` and `ClientMetadata` a request
  carries reaching the handler
- `AutoVerifiedAttributes`, so confirming a sign-up sets `email_verified` or
  `phone_number_verified`, and `AdminCreateUserConfig.AllowAdminCreateUserOnly`, which refuses
  `SignUp` against a pool created with it
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
- The `PreAuthentication` and `PostAuthentication` Lambda triggers, invoked with the real event
  around a sign-in, with the sign-in's own `ClientMetadata` reaching them
- The `PreTokenGeneration` Lambda trigger at `V1_0`, whose `claimsOverrideDetails` adds, overrides
  and suppresses the claims of an id token, and whose `groupOverrideDetails` replaces
  `cognito:groups`, on a sign-in and on a refresh alike
- A record on each pool of the messages it would have sent, read with `sentMessages`, carrying the
  recipient, the medium, the subject, the body and the occasion, with the pool's own verification
  wording and the `{####}` placeholder filled in
- The `CustomMessage` Lambda trigger, invoked before a message is recorded, with the occasion in its
  `triggerSource` and the wording it writes replacing the pool's
- The recorded messages listed over HTTP by `serveSimAws`, at `/<userPoolId>/messages`
- Real RS256 JWTs, signed by a key the pool publishes as a JWKS, so a verifier configured for the
  pool verifies them unchanged
- A pool's `.well-known/jwks.json` and `.well-known/openid-configuration` served over HTTP by
  `serveSimAws`, anonymously, so a verifier fetches the keys rather than being handed them
- `CreateUserPoolDomainCommand`, `DescribeUserPoolDomainCommand` and
  `DeleteUserPoolDomainCommand`, for a Cognito prefix domain and for a custom domain
- `CreateIdentityProviderCommand`, `DescribeIdentityProviderCommand`,
  `UpdateIdentityProviderCommand`, `DeleteIdentityProviderCommand` and
  `ListIdentityProvidersCommand`
- The `/oauth2/authorize`, `/oauth2/token` and `/logout` endpoints of a pool's domain, served on the
  domain's own hostname, for an authorization code grant through an external identity provider,
  with PKCE and with a `refresh_token` grant
- The pool user a federated sign-in creates, named `<ProviderName>_<subject>`, in the
  `EXTERNAL_PROVIDER` status, carrying the `identities` attribute and claim and the attributes the
  provider's `AttributeMapping` named
- App client OAuth settings: `AllowedOAuthFlowsUserPoolClient`, `AllowedOAuthFlows`,
  `AllowedOAuthScopes`, `CallbackURLs`, `LogoutURLs`, `DefaultRedirectURI` and
  `SupportedIdentityProviders`, each of which an authorize or token request is checked against
- `AWS::Cognito::UserPool`, `AWS::Cognito::UserPoolClient`, `AWS::Cognito::UserPoolGroup`,
  `AWS::Cognito::UserPoolDomain` and `AWS::Cognito::UserPoolIdentityProvider` deployed from a
  CloudFormation template, with the `Ref` and `Fn::GetAtt` values real CloudFormation returns
- Pool ids in the real `<region>_<nine characters>` form, and pool ARNs built from them
- The real default password policy, applied to the passwords users are given
- The real user status lifecycle, so an admin-created user stays in `FORCE_CHANGE_PASSWORD` until it
  has a permanent password, and a signed-up user stays in `UNCONFIRMED` until it confirms
- Group membership, and the precedence order the `cognito:groups` claim uses
- App client authentication flows, token lifetimes, generated client secrets and
  `PreventUserExistenceErrors`
- Refresh tokens that expire at the app client's `RefreshTokenValidity`, thirty days by default on
  the simulated clock
- Authorization of the administrative operations by simulated IAM, against the real IAM action and
  ARN
- Calls made from inside a simulated Lambda handler, authorized as the function's execution role

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
  is stored and reported, and nothing assumes that role. A `PreTokenGeneration` handler naming
  either claim is refused rather than half-applied.
- A pool publishes one signing key where real Cognito publishes two and rotates between them, so
  code assuming a single JWKS entry passes here and is still wrong against real AWS. The key is
  generated with `node:crypto` the first time the pool signs or publishes one, and kept in memory
  for the life of the simulation.
- A password is kept so a user can sign in with it, and nothing reads one back.
- Users are resolved by username only. Real Cognito also accepts a user's `sub` where an admin
  operation asks for a username, and that fails here with `UserNotFoundException`.
- A pool reports the confirmation code a signed-up user is waiting to answer with, through
  `confirmationCode` on the pool object. Real Cognito sends the code and never reports it to anyone.
  Nothing here delivers a message, so this is what makes a registration flow testable, and it is a
  deliberate divergence rather than an operation to write application code against.
- A confirmation code never expires, where a real one lasts 24 hours. `ResendConfirmationCode` is
  what replaces one.
- `AdminConfirmSignUp` verifies nothing, whatever the pool's `AutoVerifiedAttributes` say, as it
  verifies nothing on real Cognito. `ConfirmSignUp` sets `email_verified` and
  `phone_number_verified`, and only where the user has the attribute to verify, and a `PreSignUp`
  trigger sets them by asking for `autoVerifyEmail` or `autoVerifyPhone`.
- `AutoVerifiedAttributes` is accepted at `email` and `phone_number`, and anything else is refused.
  Those are the two Cognito can send a code to.
- `ConfirmSignUp` and `ResendConfirmationCode` report a user the pool does not hold whatever the app
  client's `PreventUserExistenceErrors` says. That setting is honoured for sign-in only.
- Password reset is not simulated. `ForgotPassword`, `ConfirmForgotPassword` and `ChangePassword`
  are not implemented, so the `RESET_REQUIRED` status cannot be reached.
- Unsimulated sign-up inputs are refused rather than ignored: `AnalyticsMetadata` and
  `UserContextData` on the three client-side operations, and `ForceAliasCreation` and `Session` on
  `ConfirmSignUp`. `ClientMetadata` is not among them on any of them: each reaches a trigger that
  runs here.
- No message is ever delivered. A pool records what it would have sent and `sentMessages` reads it
  back, which real Cognito reports to nobody. Nothing leaves the simulation, and no
  `CodeDeliveryDetails` is reported by `SignUp` or `ResendConfirmationCode`.
- A message is recorded on three occasions: `SignUp`, `ResendConfirmationCode` and
  `AdminCreateUser`. Password reset, MFA and the account-taken-over notices are occasions real
  Cognito sends on and this simulation does not reach.
- A verification message is recorded only for an attribute the pool verifies automatically, so a
  pool with no `AutoVerifiedAttributes` records none, and only for a user that has to confirm: one a
  `PreSignUp` handler auto-confirmed is sent nothing, as it is sent nothing on real Cognito. An invitation is recorded whatever the pool
  verifies, and both are recorded only where the user has an `email` or a `phone_number` to be
  reached at.
- `DesiredDeliveryMediums` is refused. The medium comes from the attribute the message is written
  to, so a request naming `SMS` for a user with an email address would be recorded as an email.
  Real Cognito defaults `AdminCreateUser` to `SMS`, and this records an email where the user has an
  address.
- An invitation for a user created with no `TemporaryPassword` keeps the `{####}` placeholder,
  because real Cognito generates a password there and this simulation leaves the user with none at
  all.
- `EmailConfiguration` and `SmsConfiguration` stay refused. A pool configured to send through SES or
  an SNS SMS role would still only record here, and accepting the configuration would say the
  messages went that way. The record is Cognito's own, which is what the default
  `EmailSendingAccount` of `COGNITO_DEFAULT` sends by, and there is no simulated SES.
- Confirming a sign-up by following a link is not simulated. A `VerificationMessageTemplate` with
  `DefaultEmailOption: CONFIRM_WITH_LINK`, an `EmailMessageByLink` or an `EmailSubjectByLink` is
  refused, and a `CustomMessage` event carries no `linkParameter`.
- `VerificationMessageTemplate` wins over `EmailVerificationMessage`, `EmailVerificationSubject` and
  `SmsVerificationMessage` where a request sets both, and each of those fills in what the template
  left out. What real Cognito does when the two disagree was not checked against a live account.
- Verification wording with no `{####}` in it is refused, as it is on real Cognito, because the
  message would reach a user with no code in it. So is wording outside the lengths Cognito takes:
  6 to 20,000 characters for an email, and 6 to 140 for a text message. The subject is not checked
  against its own length.
- The default wording, for a pool that set none, is taken from the Cognito API documentation rather
  than read back from a live account.
- The recorded messages are listed over HTTP at `GET /<userPoolId>/messages`, which is an endpoint
  real Cognito does not have. It is the serving side of `sentMessages` and a divergence for the same
  reason.
- The `CustomEmailSender` and `CustomSMSSender` triggers are refused. Real Cognito hands those the
  code as an AWS Encryption SDK ciphertext to decrypt through KMS, that envelope is not simulated
  anywhere here, and a version handing over a plain code would give a handler that cannot decrypt
  anything on real AWS.
- A temporary password never expires. `TemporaryPasswordValidityDays` is stored on the pool and
  nothing acts on it.
- Unsimulated `AdminCreateUser` inputs are refused rather than ignored: `DesiredDeliveryMediums`,
  `ForceAliasCreation`, and a `MessageAction` of `RESEND`, which invites a user that already exists.
  Its `ValidationData` and `ClientMetadata` are read, and reach the `PreSignUp` and `CustomMessage`
  triggers. `AdminUpdateUserAttributes` refuses `ClientMetadata`, because the message an attribute
  update would have sent is not one this simulation sends.
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
- `UpdateUserPool` replaces a pool's settings rather than merging into them, as real Cognito does, so
  a setting the request leaves out goes back to the default `CreateUserPool` would have given it. It
  covers the settings this simulation models: `Policies.PasswordPolicy`, `DeletionProtection`,
  `AdminCreateUserConfig.AllowAdminCreateUserOnly`, `AutoVerifiedAttributes`, `LambdaConfig` and the
  verification wording.
  `PoolName` is refused, so a pool cannot be renamed, and every input `CreateUserPool` refuses is
  refused here too, in the same words.
- `UpdateUserPoolClient` replaces an app client's settings the same way, so a setting the request
  leaves out goes back to the default `CreateUserPoolClient` would have given it. `ClientName` is
  the exception: a client has to have a name and there is no default to reset to, so an update that
  names none keeps the one the client has.
- An update leaves the client's secret alone. `UpdateUserPoolClient` has no `GenerateSecret` input
  on real Cognito, so a client created without a secret never gains one.
- A redeployed template reaches neither update. Sim CloudFormation replaces a resource whose
  resolved template entry changed rather than updating it in place, whatever the resource type.
- `PreSignUp`, `PostConfirmation`, `PreAuthentication`, `PostAuthentication`, `PreTokenGeneration`
  and `CustomMessage` are the only Lambda triggers that run. Every other `LambdaConfig` key is
  refused when the pool is created or updated, naming the trigger, because a pool that accepted one
  would never call the function the template named. The custom challenge triggers would need a
  challenge loop this simulation does not have, and the migration and federation triggers have no
  external directory to reach: a simulated identity provider answers with the user `signInAs` put
  there rather than with anything a trigger could change.
- `AdminCreateUser` does not fire `PostConfirmation`, here or on real Cognito. It is the tempting
  place to hang the trigger and the wrong one: a project relying on it would pass here and write
  nothing in production.
- `PostConfirmation_ConfirmForgotPassword` is not reached, because password reset is not simulated.
  `PostConfirmation_ConfirmSignUp` is the only source the trigger reports.
- A `PreSignUp` handler asking to verify an attribute the sign-up did not carry refuses the sign-up
  with `InvalidParameterException`. Real Cognito refuses it too, and what it names the error has not
  been checked against a live account.
- `PreSignUp_ExternalProvider` is not reached either. A federated sign-in creates the pool's user
  directly rather than through the sign-up path a trigger hangs off.
- A `PostConfirmation` or `PostAuthentication` handler that throws fails the request, and what it
  ran after is not undone: a confirmed user stays confirmed and the tokens a pool issued stay
  issued, as they do on real Cognito.
- Neither sign-in trigger fires for `REFRESH_TOKEN_AUTH`, as neither does on real Cognito.
  `PreTokenGeneration` does fire there, because the pool is issuing tokens.
- `PreTokenGenerationConfig` is refused, so the trigger runs at `V1_0` and nothing else. The `V2_0`
  and `V3_0` events customise access token claims and carry `scopesToAdd` and `scopesToSuppress`,
  none of which is simulated. The one change a `V1_0` event makes to an access token, replacing its
  `cognito:groups`, is applied.
- A `V1_0` claim value is a string, and a handler returning anything else is refused. The complex
  claim values arrived with the `V2_0` event.
- `claimsToAddOrOverride` and `claimsToSuppress` reach the id token alone, because a `V1_0` event
  customises that token. `cognito:groups` on an access token is changed through
  `groupOverrideDetails`, which is what real Cognito calls the only change a `V1_0` event makes to
  an access token. `claimsToSuppress` naming a `cognito:` claim other than `cognito:groups` is
  refused, since real Cognito suppresses none of the others.
- A `PreTokenGeneration` response naming a claim real Cognito reserves is refused rather than
  ignored, which is what real Cognito does with one. That is a deliberate divergence: a claim that
  silently does not arrive in production is the failure a test with a trigger in it is there to
  catch.
- `groupOverrideDetails.iamRolesToOverride` and `preferredRole` are refused, and the request's
  `groupConfiguration` carries neither, because the `cognito:roles` and `cognito:preferred_role`
  claims they feed are not issued here. A handler copying the request's `groupConfiguration` back
  into its response, which is how real Cognito says to leave the groups alone, works unchanged.
- `ClientMetadata` reaches `PreTokenGeneration` from `RespondToAuthChallenge` and
  `AdminRespondToAuthChallenge` alone, as it does on real Cognito. A refresh accepts one and it
  reaches nothing.
- A `CustomMessage` event reports `CLIENT_ID_NOT_APPLICABLE` as its `callerContext.clientId` for an
  `AdminCreateUser`, as real Cognito does for an admin operation, and names the app client for the
  two occasions that come through one.
- Unsimulated `CreateUserPool` inputs are refused rather than ignored: `UsernameAttributes`,
  `AliasAttributes`, `Schema`, `UsernameConfiguration`,
  `UserAttributeUpdateSettings`, `DeviceConfiguration`, `UserPoolAddOns`, `KeyConfiguration`,
  `IssuerConfiguration`, `UserPoolTags`, the email and SMS configurations, an
  `SmsAuthenticationMessage`, an `MfaConfiguration` other than `OFF`, a `UserPoolTier` other than
  `ESSENTIALS`, a `SignInPolicy`, and a `PasswordHistorySize`.
- `AccountRecoverySetting` is accepted at one value and refused at any other. Nothing here reads it,
  because there is no `ForgotPassword`. It is accepted so a CDK stack deploys, and reported back by
  `DescribeUserPool` so what the template declared stays visible. The accepted value is in
  "Properties accepted without being simulated" above.
- `AdminCreateUserConfig.AllowAdminCreateUserOnly` is acted on, and the two keys beside it are
  refused. `InviteMessageTemplate` is the wording of the invitation, and a pool cannot set its own
  yet, so an invitation is recorded at Cognito's default wording. `UnusedAccountValidityDays`
  expires a temporary password, and nothing here expires one.
- `UsernameAttributes` is worth calling out among those. A pool that signs users in by email or phone
  number stores a generated UUID as the username, so a pool created here without that would answer
  with the wrong username and the right one on real AWS.
- Unsimulated `CreateUserPoolClient` inputs are refused the same way: a `ClientSecret` of your own,
  `AnalyticsConfiguration`, `AuthSessionValidity`, `EnablePropagateAdditionalUserContextData`,
  `RefreshTokenRotation`, `ReadAttributes`, `WriteAttributes`, and an `EnableTokenRevocation` of
  `false`. `UpdateUserPoolClient` refuses the same inputs, in the same words.
- The OAuth settings need `AllowedOAuthFlowsUserPoolClient` to be true before they can be set, as
  they do on real Cognito. `AllowedOAuthFlows` takes `code` alone: `implicit` hands tokens to the
  browser, and `client_credentials` needs the resource servers that define its scopes, so both are
  refused. `AllowedOAuthScopes` takes the system scopes, and a custom scope is refused for the same
  reason.
- Unsimulated authentication inputs are refused the same way: `AnalyticsMetadata` on all four
  operations, `ContextData` on the admin ones, `UserContextData` on the client ones, and a `Session`
  on `InitiateAuth` or `AdminInitiateAuth`, which continues a flow neither of them starts.
- A pool does not report `SchemaAttributes`. Real Cognito reports the standard attribute schema on
  every pool, and there are no user attributes here to describe.
- Managed login and the classic hosted UI are pages a person fills in, and are not simulated. An
  authorize request naming no `identity_provider`, or naming `COGNITO`, would reach one of those
  pages on real Cognito and is refused here with a message saying so. The pool's own users sign in
  through `InitiateAuth` and `AdminInitiateAuth`, which are simulated. `/login`, `/signup`,
  `/oauth2/userInfo`, `/oauth2/revoke`, `/oauth2/idpresponse` and the SAML endpoints are not served.
- The implicit grant is refused, and so is the client credentials grant, which needs resource
  servers.
- The served OpenID configuration names its `authorization_endpoint`, `token_endpoint` and
  `end_session_endpoint` once the pool has a domain, at that domain's local hostname. It carries no
  `userinfo_endpoint`, where real Cognito names one.
- Nothing calls an external identity provider. A provider's `ProviderDetails` are recorded and
  validated for presence, and never used: the user a simulated provider signs in is the one
  `signInAs` put there. That accessor is a divergence for the same reason `confirmationCode` is one.
- A custom domain answers on its own hostname with no Route53 record of its own, where real AWS
  needs an alias record to the CloudFront distribution Cognito creates. The distribution name a
  domain reports is a name nothing here serves.
- `/logout` redirects and ends no session. There is no managed login session cookie here, because
  every authorize request signs in afresh at the identity provider, so there is nothing for it to
  end. It signs nobody out at the provider either, which real Cognito also does not do.
- A pool does not create a group for each identity provider, where real Cognito creates one named
  `<userPoolId>_<ProviderName>` and puts each federated user in it. A `cognito:groups` claim here
  therefore names only the groups something added the user to.
- `AdminLinkProviderForUser` is not implemented, so a federated user is never linked to a user that
  was already in the pool, and the `identities` it carries always names one provider.
- The `PreAuthentication`, `PostAuthentication` and migrate user triggers do not fire on a federated
  sign-in.
- A domain reports no `S3Bucket` or `Version`, both of which name parts of the machinery real
  Cognito builds a domain out of. Its `Status` is `ACTIVE` as soon as it exists, where a real prefix
  domain takes a minute and a custom domain up to an hour.
- A custom domain's `CertificateArn` is required and recorded, and is not resolved against simulated
  ACM. Nothing here terminates TLS.
- A `SupportedIdentityProviders` naming a provider the pool does not have is accepted, and the
  authorize request naming that provider is what refuses. Real Cognito checks the provider exists
  when the app client is written.
- The served `issuer` and `jwks_uri` name the localhost origin the request arrived on, so a client
  can fetch the keys they point at. A token's `iss` claim still names the real
  `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`, so the two disagree here and agree on
  real Cognito.
- Resource servers, MFA configuration and risk configuration are not simulated.
- Tags are not simulated. `UserPoolTags` is refused, and `TagResource`, `UntagResource` and
  `ListTagsForResource` are not implemented.
- Listings carry no filtering, and are in creation order rather than any order real Cognito chooses.
- Of the CloudFormation resource types, `AWS::Cognito::UserPool`, `AWS::Cognito::UserPoolClient`,
  `AWS::Cognito::UserPoolGroup`, `AWS::Cognito::UserPoolDomain` and
  `AWS::Cognito::UserPoolIdentityProvider` deploy. The others, including
  `AWS::Cognito::UserPoolResourceServer`, `AWS::Cognito::UserPoolUser` and everything under
  `AWS::Cognito::IdentityPool`, are reported as unsupported and skipped rather than deployed.
- The Cognito API itself is not served as HTTP by `serveSimAws`, only the two public pool endpoints.
  A `CognitoIdentityProviderClient` reaches the simulator through `SimSdk` rather than through an
  endpoint override.
- Cognito identity pools are a different service and nothing about them is simulated.
