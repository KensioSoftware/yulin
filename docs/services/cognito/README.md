# Simulated Cognito IDP

Yulin includes a simulated Cognito user pool directory for tests and local development. Pools and
their app clients are held in memory, and every operation is authorized by simulated IAM.

Only user pools are simulated. Cognito identity pools, which exchange a token for AWS credentials,
are a different service and are outside the simulation.

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

A pool created without a `Policies` of its own gets the real default of eight characters, with an
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

`AdminCreateUser` creates a user in `FORCE_CHANGE_PASSWORD`, where real Cognito leaves a user an
admin made. It has a temporary password and cannot sign in with it. Setting a permanent password
moves the user to `CONFIRMED`. The sign-in flows read that status. A user in
`FORCE_CHANGE_PASSWORD` gets the `NEW_PASSWORD_REQUIRED` challenge, not tokens.

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
and code treating the two as interchangeable fails here, and not in a deployment. Admin
operations here name a user by its username only. Real Cognito also accepts a `sub` where an
operation asks for a username. That is one thing that works there and not here. The refusal says so
when the username given is some user's `sub`.

Attributes come back under `Attributes` from `AdminCreateUser` and `ListUsers`, and under
`UserAttributes` from `AdminGetUser`, as the real API names them.

`AdminUpdateUserAttributes` changes the attributes it names and leaves the rest alone.
`AdminDisableUser` sets `Enabled` to `false` without changing the user's status, and
`AdminEnableUser` sets it back.

## Signing in by email or phone number

A pool created with `UsernameAttributes` signs its users in by that attribute, not by a username
they chose. Cognito generates a UUID as the username for such a user, and the value the
request called the username goes into the attribute the pool signs in by. That generated username
is what `AdminGetUser` reports and what the `cognito:username` claim carries. An application reading
"the username" off such a pool reads a UUID.

A CDK `UserPool` with `signInAliases: { email: true }` emits `UsernameAttributes: ["email"]`, the
usual way to build an email sign-in pool.

```typescript sim-cognito-sign-in-by-email
/**
 * A simulated pool that signs its users in by email address.
 */

import {
  AdminConfirmSignUpCommand,
  AdminGetUserCommand,
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
    UsernameAttributes: ["email"],
  }),
);
const userPoolId = pool.UserPool?.Id;

const client = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
  }),
);
const clientId = client.UserPoolClient?.ClientId;

await cognito.signUp(
  new SignUpCommand({
    ClientId: clientId,
    Username: "alice@example.com",
    Password: "Sup3rSecret!",
  }),
);

await cognito.adminConfirmSignUp(
  new AdminConfirmSignUpCommand({
    UserPoolId: userPoolId,
    // Naming the user by the address reaches it, as it does on real Cognito.
    Username: "alice@example.com",
  }),
);

const read = await cognito.adminGetUser(
  new AdminGetUserCommand({
    UserPoolId: userPoolId,
    Username: "alice@example.com",
  }),
);

console.log(read.Username); // A UUID, and not "alice@example.com"
console.log(read.UserAttributes?.find((each) => each.Name === "email")?.Value);
// "alice@example.com"

const signedIn = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: {
      USERNAME: "alice@example.com",
      PASSWORD: "Sup3rSecret!",
    },
  }),
);

console.log(signedIn.AuthenticationResult?.IdToken !== undefined); // true
// The id token's cognito:username claim is the generated username above.
```

The address goes on reaching the user. The admin operations and the sign-in flows resolve it to the
user holding it, as real Cognito resolves it, so `AdminGetUser`, `ConfirmSignUp`, `InitiateAuth` and
`AdminInitiateAuth` all take the address as well as the generated username.

A `SECRET_HASH` covers the value the request itself carries. A sign-up or a sign-in naming the
address computes it over the address. `REFRESH_TOKEN_AUTH` names no user, so its hash is computed
over the username the token was issued to, the generated one.

Two users cannot sign in by the same address. A second sign-up with one is refused with
`UsernameExistsException`, and an `AdminUpdateUserAttributes` request setting one another user
already holds is refused with `AliasExistsException`. A username written some other way than the
attribute's values are, such as a plain name on a pool signing in by email, is refused too, because
a user created that way could never sign in. A request naming one address as the username and a
different one as the attribute is refused, and never resolved in favour of either.

`UsernameAttributes` takes `email` and `phone_number`, and a pool can name both. It is settled when
the pool is created. Real `UpdateUserPool` has no such input, and a request carrying one here is
refused.

## Custom attributes

A pool holds the standard OpenID Connect attributes, and the ones its `Schema` declares beside them.
A custom attribute is the ordinary way to hold an application's own identifier for a user. A `sub`
belongs to the pool that issued it, so keying application data on one welds that data to a pool that
cannot be moved.

Cognito prefixes an attribute a pool declares with `custom:`. A `Schema` naming `userId` is written
and read as `custom:userId`.

```typescript sim-cognito-custom-attributes
/**
 * A user pool holding an application's own identifier for a user.
 */

import {
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const cognito = new SimAws().cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    Schema: [
      // Immutable, because this is the identifier the application keys its own
      // data on: Cognito takes it when the user is created and refuses every
      // write after that.
      { Name: "userId", AttributeDataType: "String", Mutable: false },
      {
        Name: "seats",
        AttributeDataType: "Number",
        Mutable: true,
        NumberAttributeConstraints: { MinValue: "1", MaxValue: "10" },
      },
    ],
  }),
);
const userPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
  }),
);
const clientId = appClient.UserPoolClient!.ClientId!;

await cognito.signUp(
  new SignUpCommand({
    ClientId: clientId,
    Username: "alice",
    Password: "Sup3rSecret!",
    UserAttributes: [
      { Name: "custom:userId", Value: "usr_01H8" },
      { Name: "custom:seats", Value: "3" },
    ],
  }),
);

const user = await cognito.adminGetUser(
  new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
);

console.log(user.UserAttributes?.find((each) => each.Name === "custom:userId"));
// { Name: "custom:userId", Value: "usr_01H8" }

// A mutable attribute changes.
await cognito.adminUpdateUserAttributes(
  new AdminUpdateUserAttributesCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    UserAttributes: [{ Name: "custom:seats", Value: "7" }],
  }),
);

// The pool reports its whole schema, the standard attributes included.
const described = await cognito.describeUserPool(
  new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
);

console.log(
  described.UserPool?.SchemaAttributes?.map((attribute) => attribute.Name),
);
// [ "sub", "address", ..., "custom:userId", "custom:seats" ]
```

The declaration is held to what real Cognito accepts. A pool AWS would have refused is refused here.
A `Required` custom attribute, a `DeveloperOnlyAttribute`, a name longer than 20 characters, a name
carrying a character Cognito rejects or its own `custom:` prefix, an attribute type Cognito lacks,
the same attribute declared twice, and an empty `Schema` or one with more than the 50
attributes one request may carry are each refused, saying why.

What an attribute may hold is held to the schema too. A `Number` attribute refuses a non-numeric
value and one outside its `NumberAttributeConstraints`, a `String` attribute refuses a value outside
its `StringAttributeConstraints`, and an attribute the schema declares `Mutable: false` refuses
every write once the user exists. An immutable attribute is one a user is created with or does
without. An attribute no schema declares is refused, saying which ones the pool does hold.

A `Schema` can also redeclare a standard attribute, which a CDK `UserPool` emits for its
`standardAttributes`. That is how a pool makes `email` required, and a user created without a
required attribute is refused. Cognito defaults `Mutable` to `false` in a declaration, and a
redeclared standard attribute is fixed unless the declaration says otherwise.

A pool's schema is settled when the pool is created. `UpdateUserPool` has no `Schema` input on real
Cognito, and a request carrying one here is refused, leaving the attributes of a pool that already
has users written against them alone. Real Cognito adds one with `AddCustomAttributes`. That is
outside the simulation.

## Signing up

`SignUp` is the other way a user gets into a pool. It names an app client rather than a pool, is
authorized by no IAM policy, and leaves the user in `UNCONFIRMED` with the password it chose.

Real Cognito emails or texts a confirmation code at that point. Nothing here delivers a message, and
the code is readable from the pool instead, through `confirmationCode` on the pool object. That is a
deliberate divergence. Real Cognito never reports a code back to anyone, and reading one is what
makes a registration flow testable at all.

The pool also records the message it would have sent, holding the wording and the code a user
would have read. That is in [Messages a pool would have sent](#messages-a-pool-would-have-sent)
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
with even when the password was right. An application can tell the two apart and send the user to
`ConfirmSignUp`. A wrong password is still refused as any wrong password is, and gives no hint that
the account is unconfirmed.

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
the code shows the address is the user's. `AdminConfirmSignUp` verifies no attribute, as on
real Cognito. An admin confirming a user says nothing about whose address it is. Only `email` and
`phone_number` can be verified, and an attribute the user lacks is left alone.

A pool created with `AdminCreateUserConfig: { AllowAdminCreateUserOnly: true }` refuses `SignUp`
with `NotAuthorizedException`, as a real one does. That value is what a CDK `UserPool` without
`selfSignUpEnabled` emits. A project testing its registration flow gets the same answer here that
the deployed pool would give. A pool created without the setting allows sign-up, the AWS default.

## Resetting a forgotten password

A user that cannot get in asks for a code with `ForgotPassword` and sets a new password with
`ConfirmForgotPassword`. Both name an app client, and neither is authorized by an IAM policy. They
are the pair an application calls when it has built its own sign-in screens.

The code goes to the same place a sign-up code goes, and is read back the same way, through
`confirmationCode` on the pool object. `ForgotPassword` answers with `CodeDeliveryDetails` naming
the medium and a masked destination, which an application prints to say where the user should go
and look.

```typescript sim-cognito-forgot-password
/**
 * Resetting a forgotten password with the code the pool issued.
 */

import {
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  ForgotPasswordCommand,
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

await cognito.signUp(
  new SignUpCommand({
    ClientId: clientId,
    Username: "alice",
    Password: "Sup3rSecret!",
    UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
  }),
);
await cognito.confirmSignUp(
  new ConfirmSignUpCommand({
    ClientId: clientId,
    Username: "alice",
    ConfirmationCode: cognito.userPool(userPoolId).confirmationCode("alice"),
  }),
);

// The user has forgotten the password it chose at sign-up.
const asked = await cognito.forgotPassword(
  new ForgotPasswordCommand({ ClientId: clientId, Username: "alice" }),
);

console.log(asked.CodeDeliveryDetails?.DeliveryMedium); // "EMAIL"
console.log(asked.CodeDeliveryDetails?.Destination); // "a***@e***.com"

// Real Cognito sends this to the user and never reports it, as with a sign-up
// code. The pool hands it over instead.
const code = cognito.userPool(userPoolId).confirmationCode("alice");

await cognito.confirmForgotPassword(
  new ConfirmForgotPasswordCommand({
    ClientId: clientId,
    Username: "alice",
    ConfirmationCode: code,
    Password: "Ev3nBetter!",
  }),
);

// The user is CONFIRMED, and the new password is the one that signs it in.
const signedIn = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Ev3nBetter!" },
  }),
);

console.log(signedIn.AuthenticationResult?.AccessToken !== undefined); // true
```

The user reaches `CONFIRMED` once the reset lands, which also confirms one that never confirmed its
sign-up. The password it had before stops working.

A wrong code is refused with `CodeMismatchException`, and the user keeps the code it was issued for
a second attempt. A spent code is refused with `ExpiredCodeException`. That is what real Cognito
calls a code it will no longer take. The new password is held to the pool's password policy, and one the policy refuses raises
`InvalidPasswordException` (the same refusal `AdminSetUserPassword` gives).

Asking twice issues a second code and the first one stops working, the way `ResendConfirmationCode`
replaces a sign-up code.

`ForgotPassword` sends its code to an attribute the pool verifies automatically, preferring `email`
over `phone_number`. A user the pool can reach at neither is refused with
`InvalidParameterException`, in the words real Cognito refuses with. A user still holding a
temporary password is refused with `NotAuthorizedException` and belongs at the
`NEW_PASSWORD_REQUIRED` challenge.

An app client's `PreventUserExistenceErrors` decides what a reset naming an unknown user gets. A
client left on the `LEGACY` default answers `UserNotFoundException`. A client set to `ENABLED`
answers as though a code had gone out, with a made-up destination. That closes the operation as a
way of finding out who has an account.

An app client created with a secret has its `SECRET_HASH` checked on both operations, computed over
the username and the client id the way the sign-in operations compute it.

### Resetting a password as an administrator

`AdminResetUserPassword` takes a user's password away and leaves it in `RESET_REQUIRED`. It names
the pool and the user, and is authorized by IAM the way the other admin operations are. From there
the user is refused at sign-in with `PasswordResetRequiredException` until it answers
`ConfirmForgotPassword` with the code the reset issued. The pool records the message carrying that
code, under the `ForgotPassword` occasion.

A federated user has no password in the pool, and both the user's own reset and the administrator's
are refused for one.

## Messages a pool would have sent

Nothing here delivers an email or a text message. A pool records what it would have sent instead,
and `sentMessages` on the pool object hands the record over. Each message carries the recipient, the
medium, the subject, the body and the occasion it was sent on.

A message is recorded on five occasions. Those are a `SignUp`, a `ResendConfirmationCode`, an
`AdminCreateUser` that did not ask for `MessageAction: SUPPRESS`, an MFA code sent by text message,
and a password reset the user or an administrator started. The verification wording is the pool's
own, and `{####}` is replaced with the code the user was issued. A sign-up a `PreSignUp`
handler auto-confirmed records none. That user has no code to answer with, and real Cognito sends it
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
verification message goes to an attribute the pool verifies automatically. A pool created with
`AutoVerifiedAttributes: ["email"]` writes to the user's `email`, and a pool that verifies no
attribute records no verification message at all. An invitation goes to the user's `email`, or to
its `phone_number` where it has no email address. An email is recorded with a subject and a text
message without one, and a user the pool has no address for is sent nothing.

`AdminCreateUser` records the invitation, carrying the username and the temporary password the
request named, unless the request asked for `MessageAction: SUPPRESS`.

A pool created with no wording of its own uses the wording real Cognito uses: `Your verification
code` and `Your verification code is {####}` for a verification message, and `Your temporary
password` and `Your username is {username} and temporary password is {####}.` for an invitation.
`EmailVerificationMessage`, `EmailVerificationSubject`, `SmsVerificationMessage` and
`VerificationMessageTemplate` are all read, at whatever wording a request sets, held to the two
rules real Cognito holds them to. A message carries `{####}`, and runs to 20,000 characters for an
email and the 140 an SMS carries.

A pool keeps this record whichever service sent the message. One sending through Cognito's own
email stops there, exactly as on real AWS. One whose `EmailConfiguration` names `DEVELOPER` also
went through simulated SES, covered under
[Sending a pool's email through SES](#sending-a-pools-email-through-ses).

`SmsConfiguration` is refused. It names the IAM role Cognito assumes to publish a text message
through SNS. A pool here records the text message rather than publishing it, leaving that role to
name a permission the simulation never exercises.

### The CustomMessage trigger

A pool with a `CustomMessage` Lambda trigger runs it before the message is recorded, and what the
handler writes into `response.emailSubject`, `response.emailMessage` and `response.smsMessage`
replaces the pool's own wording. The handler writes `request.codeParameter` into its message where
the code belongs, as it does on real Cognito, and the code goes in afterwards.

`triggerSource` names the occasion: `CustomMessage_SignUp`, `CustomMessage_ResendCode`,
`CustomMessage_AdminCreateUser`, `CustomMessage_Authentication` or `CustomMessage_ForgotPassword`.
The invitation carries `request.usernameParameter` as well.

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

A handler that writes nothing leaves the pool's own wording, which a handler that only cares about
one occasion does for the others. A handler that throws fails the request with
`UserLambdaValidationException` and leaves the pool with no message, because the trigger runs before
the message is recorded. A `response` of any other type than an object, or a message in it of any
other type than a string, fails with `InvalidLambdaResponseException`.

`ClientMetadata` on `SignUp`, `ResendConfirmationCode` and `AdminCreateUser` reaches the handler as
`request.clientMetadata`.

### Reading the messages over HTTP

`serveSimAws` lists a pool's recorded messages at `GET /<userPoolId>/messages`, readable during
local development. Real Cognito serves nothing at that path. This is the serving side of
`sentMessages`, and a divergence for the same reason that accessor is one.

The response is `{ "messages": [ ... ] }`, each message carrying `username`, `recipient`, `medium`,
`subject` where it has one, `body`, `occasion` and an ISO `sentDate`.

## Sending a pool's email through SES

A pool created with `EmailConfiguration: { EmailSendingAccount: "DEVELOPER", ... }` sends its email
through simulated SES, in the region its `SourceArn` names. That is the CDK
`cognito.UserPoolEmail.withSES({ ... })` configuration. An account still in the
[SES sandbox](https://yulinsim.dev/services/ses/#the-sandbox) reaches only verified recipients, which is most of a real sign-up
list turned away, and a pool recording only its own messages would report that as a working
sign-up.

The message is recorded in both places. `sesV2().sentEmails()` holds it as it went out, with the
configured `From`, `ReplyToEmailAddress` and `ConfigurationSet`. `sentMessages()` on the pool holds
it as well, which is what `GET /<userPoolId>/messages` lists for a developer reading a confirmation
code out of a browser sign-up.

```typescript sim-cognito-ses-email
/**
 * A user pool sending its verification message through simulated SES.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
const cognito = simAws.cognitoIdentityProvider();
const ses = simAws.sesV2();

// The sending domain, and the applicant the sandbox would otherwise refuse.
ses.verifyIdentity("example.com");
ses.verifyIdentity("alice@example.org");

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    AutoVerifiedAttributes: ["email"],
    EmailConfiguration: {
      EmailSendingAccount: "DEVELOPER",
      From: "Acme <no-reply@example.com>",
      // The Account in the ARN is read past: the pool resolves the identity in
      // its own Account, so a synthesized template needs no rewriting.
      SourceArn: "arn:aws:ses:eu-west-2:111122223333:identity/example.com",
      ReplyToEmailAddress: "support@example.com",
    },
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
    UserAttributes: [{ Name: "email", Value: "alice@example.org" }],
  }),
);

const [email] = ses.sentEmails();

console.log(email?.fromEmailAddress); // "Acme <no-reply@example.com>"
console.log(email?.destination.toAddresses); // ["alice@example.org"]
console.log(email?.replyToAddresses); // ["support@example.com"]

// The pool kept it too, which is what the messages endpoint lists.
console.log(cognito.userPool(userPoolId).sentMessages().length); // 1
```

### What fails, and how

The identity is resolved when a message is sent rather than when the pool is created, so a pool can
be created before the identity it names and a stack can deploy the two in either order.

A `SourceArn` naming a domain has to come with a `From`, as it does on real Cognito. A domain
identity covers every address at it and names none of them, so there is no one address for Cognito
to write as. An address identity needs no `From`, and a pool without one sends as that address.

A sign-up against a pool whose `SourceArn` identity is missing or still unverified fails with
`InvalidEmailRoleAccessPolicyException`, which is what real Cognito raises when it cannot use the
identity. A message SES then refuses fails with `CodeDeliveryFailureException`, which in a
simulation means the sandbox turned down an unverified recipient. The two are kept apart because
they are different problems. The first is an account set up wrong, and the second is one that has
yet to leave the sandbox. Neither records a message on the pool or on SES.

Real Cognito also needs an identity policy letting Cognito send as the identity. That part is left
out, because simulated SES has no identity policies. A verified identity is as far as the check
goes.

The caller's own permissions decide none of this. Real Cognito sends through a service-linked role,
so a Role allowed to call `AdminCreateUser` and nothing on SES still gets its invitation sent.

### Which region, and which account

`SourceArn` is read for its region and its identity name. The Account in it is read past, and the
pool resolves the identity in its own Account instead. CDK synthesizes the Account the stack
deploys to, which is a real one, while a simulation runs under
`888888888888` unless it is told otherwise, so matching the whole ARN would leave every project
rewriting the Account id in its template before a sign-up could send.

The region is honoured. A pool in `eu-west-2` whose `SourceArn` names `us-east-1` sends through the
`us-east-1` SES, and the identity has to be verified there. Real Cognito restricts which regions a
pool may pair with, and this simulation accepts any of them.

`COGNITO_DEFAULT` is the default and needs no `SourceArn`. Such a pool records its messages and
reaches SES at no point, which is what real Cognito's built-in sending does. A
`ReplyToEmailAddress` alongside it, which is what `UserPoolEmail.withCognito({ replyTo })` emits, is
accepted and reported back.

`DescribeUserPool` answers with the `EmailConfiguration` the request set, and a pool created without
one describes itself without one.

## Listing users

`ListUsers` pages by `Limit` and `PaginationToken`, as the real operation calls them.

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
wrong users and no error, and that is the kind of pass that turns into a failure in a deployment.
List the users and filter them in the test instead.

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
any group that has one. `AdminListGroupsForUser` sorts by it, lowest value first, the order the
`cognito:groups` claim will use once tokens are simulated. `ListGroups` leaves its answer unsorted,
listing a pool's groups in creation order.

Adding a user to a group they are already in succeeds and changes nothing, as it does on real
Cognito, and nothing has to check first. Removing a user who was never in the group succeeds too.

Deleting a group takes the membership with it and leaves the users alone. Deleting a user takes them
out of every group, and a group never holds a member the pool cannot describe.

`ListUsersInGroup` reads the membership the other way round, and answers with the same user shape
`ListUsers` does.

`UpdateGroup` replaces the description, the precedence and the role together, so a property the
request leaves out is cleared. Real Cognito documents neither replacing nor merging here, and naming
every property is the one thing that behaves the same either way.

## App clients

An app client is how an application reaches a pool. What it holds decides what that application can
do, and the settings later work depends on are stored and reported, never dropped.

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
client created without `ExplicitAuthFlows` supports `ALLOW_REFRESH_TOKEN_AUTH`,
`ALLOW_USER_SRP_AUTH` and `ALLOW_CUSTOM_AUTH`, which real Cognito gives it. Sign-in with a username
and password is absent from that set, and that is why `USER_PASSWORD_AUTH` fails on a client nobody
configured for it, here and on real AWS.

`PreventUserExistenceErrors` decides what a sign-in naming a user the pool lacks answers with. On
`ENABLED` it is the `NotAuthorizedException` a wrong password gets, and on `LEGACY` it is
`UserNotFoundException`. The API default is `LEGACY`, what a client created here without the setting
gets, and the Cognito console sets `ENABLED` on a client made through it.

Token lifetimes default to an hour for access and ID tokens and thirty days for refresh tokens. The
units are separate inputs, so `AccessTokenValidity: 1` means an hour and `RefreshTokenValidity: 1`
means a day unless `TokenValidityUnits` says otherwise.

`AuthSessionValidity` is how long a challenge issued through the client can be answered for. It is
counted in whole minutes, between three and fifteen, and a client that asked for none gets the
three minutes real Cognito gives it. A test with anything to say about a challenge session running
out is quicker to write against a client that asked for fifteen.

The legacy authentication flows (`ADMIN_NO_SRP_AUTH`, `CUSTOM_AUTH_FLOW_ONLY` and
`USER_PASSWORD_AUTH`) work on their own, and a request mixing them with the `ALLOW_` prefixed values
is refused, as real Cognito refuses it. A client holding `ADMIN_NO_SRP_AUTH` can run
`ADMIN_USER_PASSWORD_AUTH` and one holding `USER_PASSWORD_AUTH` can run `USER_PASSWORD_AUTH`, what
those settings meant before the `ALLOW_` prefixed ones replaced them.

## Updating an app client

`UpdateUserPoolClient` changes a client's settings, and `DescribeUserPoolClient` reports them along
with a `LastModifiedDate` from when the update happened. A client never updated reports its creation
date there.

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

An update replaces the client's configuration rather than merging into it, as real Cognito does. A
setting the request leaves out goes back to the default `CreateUserPoolClient` would have given it,
and that is why the example above repeats `ExplicitAuthFlows` to keep them. A request carrying only
`ClientName` sends the authentication flows back to `ALLOW_REFRESH_TOKEN_AUTH`,
`ALLOW_USER_SRP_AUTH` and `ALLOW_CUSTOM_AUTH`, the token validities back to an hour and thirty days,
and `PreventUserExistenceErrors` back to `LEGACY`.

`ClientName` is the one setting an omitted request keeps rather than resets. A client has to have a
name, and `CreateUserPoolClient` requires one, leaving no default to go back to.

The client's secret is untouched by an update. `UpdateUserPoolClient` has no `GenerateSecret` input
on real Cognito, and a client created without a secret never gains one while a client with one keeps
the same value.

A token already issued keeps the expiry it was issued with, because that expiry was stamped when the
token was handed out. Shortening `AccessTokenValidity` therefore applies to the next sign-in, and
not to a token a test is already holding, as it does on real Cognito. A changed `ExplicitAuthFlows`
takes effect for the next `InitiateAuth`, and removing `ALLOW_USER_PASSWORD_AUTH` starts refusing
that flow.

The inputs `CreateUserPoolClient` refuses are refused here too, in the same words, saying
`UpdateUserPoolClient`.

## Signing in and verifying tokens

`AdminInitiateAuth` runs the `ADMIN_USER_PASSWORD_AUTH` flow and answers with real signed tokens.
The app client has to be created with `ALLOW_ADMIN_USER_PASSWORD_AUTH` among its
`ExplicitAuthFlows`, as it does on real Cognito, and a request against a client without it is
refused whatever the password was.

This is the server-side flow, which needs AWS credentials and the
`cognito-idp:AdminInitiateAuth` permission. The client-side flow a browser or mobile app uses is
`InitiateAuth`, below.

The tokens are RS256 JWTs signed by a key the pool publishes. Hand that JWKS to a verifier and it
verifies them with nothing stubbed and no network involved.

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

An `AuthenticationResult` carries an `AccessToken`, an `IdToken`, a `RefreshToken`, an `ExpiresIn`
of 3600 and a `TokenType` of `Bearer`. The refresh token is an opaque string, not a JWT, as it is on
real Cognito, and the pool that issued it is what knows whose it is.

The claim split is the real one. The id token carries `aud`, `token_use: "id"`, `cognito:username`
and the user's attributes. The access token carries `client_id` and no `aud`, `token_use: "access"`,
`username` and a `scope` of `aws.cognito.signin.user.admin`. Both carry the same `sub`, and both
carry `cognito:groups` in precedence order when the user is in any groups. Code reading the wrong
token for a claim fails here the way it would in production.

The `iss` claim is `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`, and the JWT header
names `RS256` and a `kid` the pool's JWKS holds. That is everything a verifier checks.

## The new password challenge

A user an admin created is in `FORCE_CHANGE_PASSWORD` and cannot sign in. Signing in with its
temporary password answers with the `NEW_PASSWORD_REQUIRED` challenge and a session, not
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

Name a `TemporaryPassword` on `AdminCreateUser` when the test means to sign the user in. Real
Cognito generates one and emails it, and nothing here delivers a message. A user created without one
has no password that works.

The new password is checked against the pool's policy and confirms the user, which signs in normally
from then on. A session is single use and lasts three minutes of simulated time, so a replayed one
and one left too long both fail with `NotAuthorizedException`.

A wrong password and a disabled user fail with `NotAuthorizedException` too, saying no more than
real Cognito says. An app client created with `GenerateSecret: true` needs a correct `SECRET_HASH`
in `AuthParameters`, the HMAC-SHA256 of the username and client id keyed by the client secret.

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
refresh token comes back, as none does on real Cognito with refresh token rotation off. The client
keeps the one it has until that expires. `REFRESH_TOKEN` is the same flow under its other
name, and both `InitiateAuth` and `AdminInitiateAuth` run it. An app client that rotates its refresh
tokens renews through `GetTokensFromRefreshToken`, covered in the section below.

The app client has to have `ALLOW_REFRESH_TOKEN_AUTH`, one of the flows a client created without
`ExplicitAuthFlows` gets.

A refresh token lasts the app client's `RefreshTokenValidity`, thirty days by default, counted on
the simulated clock. Advancing time past that is what makes a refresh fail with
`NotAuthorizedException`, and a test can exercise the sign-in-again path without waiting a month.

A refresh token belongs to the app client that got it, so presenting one to another client in the
same pool is refused. A refresh for a user that has been disabled or deleted is refused too.

## Rotating refresh tokens

An app client created with a `RefreshTokenRotation` renews its sessions through
`GetTokensFromRefreshToken`. That operation takes the app client id, the refresh token and the app
client's secret. It carries no `SECRET_HASH` and names no user, because the refresh token is what
says whose session it is.

Each renewal answers with a replacement refresh token, and the token that bought it stops working.
`RetryGracePeriodSeconds` is how long the spent one keeps being accepted, up to the minute Cognito
allows. A client that never saw the answer to a request can retry inside that window and be answered
rather than sent back to the sign-in page.

The replacement runs out when the token it replaced would have. A session on an app client whose
`RefreshTokenValidity` is thirty days ends thirty days after the sign-in, however often it was
renewed in between.

```typescript sim-cognito-refresh-token-rotation
/**
 * Renewing a session on an app client that rotates its refresh tokens.
 */

import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  GetTokensFromRefreshTokenCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool!.Id!;

// A rotating client has no ALLOW_REFRESH_TOKEN_AUTH, which is what
// aws-cdk-lib synthesizes for a refreshTokenRotationGracePeriod.
const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
    RefreshTokenRotation: { Feature: "ENABLED", RetryGracePeriodSeconds: 30 },
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
const refreshToken = signedIn.AuthenticationResult!.RefreshToken!;

// An hour on, the access token has expired and the session is renewed.
await simAws.clock().advanceBy({ hours: 1 });

const renewed = await cognito.getTokensFromRefreshToken(
  new GetTokensFromRefreshTokenCommand({
    ClientId: clientId,
    RefreshToken: refreshToken,
  }),
);

// A replacement came back, and the application holds that from now on.
console.log(renewed.AuthenticationResult!.RefreshToken !== refreshToken); // true

// The spent token is still accepted inside the thirty second grace period.
await simAws.clock().advanceBy({ seconds: 10 });

const retried = await cognito.getTokensFromRefreshToken(
  new GetTokensFromRefreshTokenCommand({
    ClientId: clientId,
    RefreshToken: refreshToken,
  }),
);

console.log(retried.AuthenticationResult!.AccessToken !== undefined); // true

// A minute later it has been rotated out for good.
await simAws.clock().advanceBy({ minutes: 1 });

try {
  await cognito.getTokensFromRefreshToken(
    new GetTokensFromRefreshTokenCommand({
      ClientId: clientId,
      RefreshToken: refreshToken,
    }),
  );
} catch (error) {
  console.log((error as Error).message); // "Refresh Token has been revoked."
}
```

`GetTokensFromRefreshToken` renews a session on an app client that does not rotate as well. There it
answers with a new access token and id token and no refresh token, the way `REFRESH_TOKEN_AUTH`
does.

`REFRESH_TOKEN_AUTH` against a rotating app client is refused, and the refusal names the operation
to use instead. `aws-cdk-lib` drops `ALLOW_REFRESH_TOKEN_AUTH` from a client the moment it is given
a `refreshTokenRotationGracePeriod`, so a client synthesized from CDK is refused by the flow check
before it reaches this.

A confidential app client sends `ClientSecret` with the request, and a request carrying the wrong
secret or none at all is refused with `NotAuthorizedException`. `DeviceKey` is refused, because
device remembering is not simulated.

## Signing out

`GlobalSignOut` revokes the tokens a user holds, and is authorized by that user's own access token
rather than by IAM. `AdminUserGlobalSignOut` does the same thing for a user an administrator names,
and does need the `cognito-idp:AdminUserGlobalSignOut` permission on the pool.

After either, the user's refresh tokens are gone, and a `REFRESH_TOKEN_AUTH` request fails while the
user has to sign in again. Signing out leaves the user free to sign in again. It ends the sessions
it had.

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
provider. No Cognito API operation does it, so an application redirects the browser to the authorize
endpoint and exchanges the code it comes back with.

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

A prefix domain is served at `<prefix>.auth.<region>.amazoncognito.com`, and a custom domain, one
created with a `CustomDomainConfig`, at the hostname it names. A pool has one domain, and a domain
string is unique across every simulated account and region, as it is across the whole of real AWS.

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

`signInAs` stands in for everything that happens at the provider, where a real user types a password
this simulation never sees. An authorize request that reaches a provider nobody is signed in at is
refused, saying so, rather than signing in a user nothing put there. `signOut()` on the provider
puts it back that way.

### Driving the code flow

The browser goes to `/oauth2/authorize`, comes back to the app client's callback URL with a code,
and the application's own server exchanges that code at `/oauth2/token`. Both endpoints are on the
domain's hostname, and `SimAwsHttp` sends a request into the simulation without a server listening.
A domain answers on the real AWS hostname as well as on the localhost one `serveSimAws` rewrites it
to. The URL an application already builds needs no changing:

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

A simulated Lambda reaches the same token endpoint. A handler that exchanges the code with `fetch`
or `node:https` is answered by the simulated domain on the hostname its own code already names, so
the callback the whole of a site's sign-in passes through can be tested as it is deployed. See
[the HTTP requests function code makes](https://yulinsim.dev/services/lambda/#the-http-requests-function-code-makes "Simulated Lambda usage docs").

The pool creates a user of its own for each external subject the first time it signs in, exactly as
real Cognito does. The username is the provider name and the subject with an underscore between
them, the status is `EXTERNAL_PROVIDER`, and the provider's claims reach the user through the
provider's attribute mapping. The same subject signing in again reaches the same user, with its
mapped attributes brought up to date. `AdminGetUser` reports where it came from in an `identities`
attribute, and the id token carries the same thing as an `identities` claim.

An authorization code is single use and lasts five minutes on the simulated clock. The token
endpoint also answers a `grant_type` of `refresh_token`, with the refresh token the grant handed
out.

### Signing a local user in

An authorize request naming no `identity_provider` signs in one of the pool's own users. Real
managed login answers that request with a form and takes an email address and a password from it.
Here the two arrive as a `username` and a `password` beside the parameters the request already
carries, and everything after them is the same grant. A pool that allows passkeys offers one on the
same form, which is covered in [A passkey at managed login](#a-passkey-at-managed-login). The app client needs `COGNITO` among its
`SupportedIdentityProviders`, which is what real Cognito needs before managed login offers the form
at all.

```typescript sim-cognito-hosted-local-sign-in
/**
 * Signing one of a pool's own users in at the authorize endpoint.
 */

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const userPoolId: string;
declare const clientId: string;

const cognito = simAws.cognitoIdentityProvider();
const pool = cognito.userPool(userPoolId);
const callbackUrl = "https://www.example.com/user/callback";

// The two fields managed login's form would have taken, passed with the
// parameters the browser arrived on.
const redirect = await cognito.hostedAuthorize(pool, {
  response_type: "code",
  client_id: clientId,
  redirect_uri: callbackUrl,
  scope: "openid email",
  state: "csrf-token",
  username: "alice",
  password: "Sup3rSecret!",
});

const callback = new URL(redirect.location);
console.log(callback.searchParams.get("state")); // "csrf-token"

// The application's own server exchanges the code, as it does after a
// federated sign-in.
const tokens = await cognito.hostedToken(pool, {
  grant_type: "authorization_code",
  client_id: clientId,
  code: callback.searchParams.get("code")!,
  redirect_uri: callbackUrl,
});

console.log(tokens.token_type); // "Bearer"
```

The password is checked the way `InitiateAuth` checks it. A wrong password is a
`NotAuthorizedException`, a user that has not confirmed its sign-up is a
`UserNotConfirmedException`, and a username the pool does not hold depends on the app client's
`PreventUserExistenceErrors`. None of the three issues a code.

An `identity_provider` of `COGNITO` reaches the same place, which is where real managed login sends
a request that skipped the provider choice.

Two sign-ins real managed login answers with a further page are refused instead. A user that has
registered a second factor is one, and a user holding a temporary password from `AdminCreateUser` is
the other. Both say which page would have come next, and where the simulation does answer that
challenge. `InitiateAuth` issues the MFA challenge and the new password challenge, and
`AdminSetUserPassword` gives a user a permanent password.

Users sign themselves up through `SignUp` and `ConfirmSignUp`, which are covered under
[Signing up](#signing-up). A user confirmed that way signs in here with the password it chose, and
so does one that signed up on the page below.

### The pages managed login serves

A served domain answers five pages, so a browser in a local development server completes a whole
sign-up, password reset and sign-in without any of it being stubbed out.

`GET /oauth2/authorize` naming no `identity_provider` answers HTML holding the sign-in form. The
form has a username field, a password field, and the authorize parameters as hidden inputs, and it
posts back to `/oauth2/authorize`. A pool that allows passkeys carries a second button beside them.
The pool's identity providers are links to the same endpoint with `identity_provider` set, so every
way in is on the one page. Posting the form redirects to the app client's callback URL with the code
and the `state`, honouring a `code_challenge` the request carried.

`/signup` is a link from that page. Its form asks for a username, a password and the attributes the
pool needs, which are the ones its `Schema` made required and the ones its `AutoVerifiedAttributes`
names. Posting it does what `SignUp` does and sends the browser to `/confirm`.

`/confirm` asks for the code, does what `ConfirmSignUp` does with it, and sends the browser back to
`/oauth2/authorize` to sign in. Its second button is `ResendConfirmationCode`. Nothing delivers a
code to anybody, so a test reads it off the pool the way it does for any other sign-up:

```typescript sim-cognito-managed-login-pages
/**
 * Signing up, confirming and signing in through the served pages.
 */

import type { SimAws } from "@kensio/yulin";
import { SimAwsHttp } from "@kensio/yulin/serve";

declare const simAws: SimAws;
declare const userPoolId: string;
declare const clientId: string;

const http = new SimAwsHttp({ simAws });
const domain = "https://myapp-login.auth.eu-west-2.amazoncognito.com";
const parameters = {
  response_type: "code",
  client_id: clientId,
  redirect_uri: "https://www.example.com/user/callback",
  scope: "openid email",
  state: "csrf-token",
};

const posted = async (
  path: string,
  fields: Record<string, string>,
): Promise<Response> =>
  http.fetch(`${domain}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...parameters, ...fields }).toString(),
  });

// The sign-in page is what the authorize endpoint answers a browser with.
const signInPage = await http.fetch(
  `${domain}/oauth2/authorize?${new URLSearchParams(parameters).toString()}`,
);
console.log(signInPage.headers.get("content-type")); // "text/html; charset=utf-8"

// The sign-up form creates the user, unconfirmed.
await posted("/signup", { username: "alice", password: "Sup3rSecret!" });

// The code the pool would have emailed is read off the pool.
const pool = simAws.cognitoIdentityProvider().userPool(userPoolId);
await posted("/confirm", {
  username: "alice",
  code: pool.confirmationCode("alice") ?? "",
});

// That same user then signs in and reaches the callback with a code.
const signedIn = await posted("/oauth2/authorize", {
  username: "alice",
  password: "Sup3rSecret!",
});
const callbackUrl = new URL(signedIn.headers.get("location")!);
console.log(callbackUrl.searchParams.get("state")); // "csrf-token"
console.log(callbackUrl.searchParams.get("code") !== null); // true
```

`/forgotPassword` is the other link from the sign-in page, and it is where a person who cannot get
in goes. Its form asks who has forgotten the password, does what `ForgotPassword` does, and sends
the browser to `/confirmForgotPassword`. That page takes the code and a new password, does what
`ConfirmForgotPassword` does, and sends the browser back to `/oauth2/authorize` to sign in with the
password it has just chosen. Both paths are the ones real managed login serves these two steps at.

```typescript sim-cognito-managed-login-reset
/**
 * Resetting a forgotten password through the served pages.
 */

import type { SimAws } from "@kensio/yulin";
import { SimAwsHttp } from "@kensio/yulin/serve";

declare const simAws: SimAws;
declare const userPoolId: string;
declare const clientId: string;

const http = new SimAwsHttp({ simAws });
const domain = "https://myapp-login.auth.eu-west-2.amazoncognito.com";
const parameters = {
  response_type: "code",
  client_id: clientId,
  redirect_uri: "https://www.example.com/user/callback",
  scope: "openid email",
  state: "csrf-token",
};

const posted = async (
  path: string,
  fields: Record<string, string>,
): Promise<Response> =>
  http.fetch(`${domain}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...parameters, ...fields }).toString(),
  });

// A confirmed user of the pool has forgotten its password.
await posted("/forgotPassword", { username: "alice" });

// The code the pool would have emailed is read off the pool, as a sign-up
// code is.
const pool = simAws.cognitoIdentityProvider().userPool(userPoolId);
await posted("/confirmForgotPassword", {
  username: "alice",
  code: pool.confirmationCode("alice") ?? "",
  password: "Ev3nBetter!",
});

// The user signs in with the new password and reaches the callback with a
// code and the state the application began with.
const signedIn = await posted("/oauth2/authorize", {
  username: "alice",
  password: "Ev3nBetter!",
});
const callbackUrl = new URL(signedIn.headers.get("location")!);
console.log(callbackUrl.searchParams.get("state")); // "csrf-token"
console.log(callbackUrl.searchParams.get("code") !== null); // true
```

A refusal a person can do something about is shown on the form they posted. A wrong password comes
back on the sign-in form and issues no code, a password the pool's policy turns down comes back on
the sign-up form or the new password form, and a wrong reset code comes back on the form that asked
for it, leaving the password alone. A refusal the application caused, such as a `redirect_uri` the
app client never registered, is answered the way every other authorize refusal is.

What `/forgotPassword` shows for a username the pool lacks is the app client's
`PreventUserExistenceErrors` decision. A client set to `ENABLED` sends the browser on to the code
page either way, and one left on the `LEGACY` default says the user is not there.

All five carry a small inline stylesheet that approximates real managed login. A card centred on the
page, a bold heading, labels above full-width fields, and a full-width blue submit button. The
stylesheet is part of the page. Nothing else is fetched to render one. There is no script on any of
them, and no close match to what real managed login looks like. Real managed login is built on
Cloudscape and draws components these pages have no equivalent for.

### The browser's managed login session

A sign-in at the hosted domain starts a session for that browser. Real managed login keeps it in a
cookie named `cognito` on the pool's domain and holds it for an hour, and a served sign-in here sets
the same cookie. An authorize request carrying it is answered with a code and asks for no
credentials, which is what signs a returning browser back in without the form.

A test driving the endpoints in process passes the session as a third argument, and reads what
happened from `redirect.session`.

```typescript sim-cognito-hosted-session
/**
 * A browser signing in once with its password, and again from its session.
 */

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const userPoolId: string;
declare const clientId: string;

const cognito = simAws.cognitoIdentityProvider();
const pool = cognito.userPool(userPoolId);
const parameters = {
  response_type: "code",
  client_id: clientId,
  redirect_uri: "https://www.example.com/user/callback",
  scope: "openid email",
};

const first = await cognito.hostedAuthorize(pool, {
  ...parameters,
  username: "alice",
  password: "Sup3rSecret!",
});

console.log(first.session.outcome); // "started"

// The same browser, sent back to authorize carrying no credentials.
const second = await cognito.hostedAuthorize(
  pool,
  parameters,
  first.session.startedSession,
);

console.log(second.session.outcome); // "reused"
console.log(second.username); // "alice"
```

The `outcome` is `started` where the sign-in took credentials, `reused` where the browser's own
session answered it, and `ended` at the logout endpoint. Asserting on it is how a test tells a
sign-in that needed a password from one that did not.

Three parts of the real behaviour are modelled with it.

- Signing in from the session leaves the hour where the interactive sign-in put it. A browser coming
  back at fifty minutes gets a code, and the same browser at seventy minutes gets the form.
- The session belongs to the pool's domain. A browser that signed in for one app client is a
  returning browser to every other app client of the same pool.
- A sign-in at an identity provider starts one too, so a Google user comes back to a plain authorize
  request already signed in.

A user disabled since the session started is refused the way every other sign-in refuses one, and a
user deleted since then leaves the session with nobody to sign in, so the form answers instead.
Attribute and password changes go by without disturbing it.

### Signing out

`GET /logout?client_id=...&logout_uri=...` ends the browser's managed login session and redirects to
the sign-out URL, once it has checked it is one of the app client's `LogoutURLs`. The served form
clears the `cognito` cookie. After that the next authorize request asks for a password again.

`GlobalSignOut` and `AdminUserGlobalSignOut` revoke a user's tokens and leave the managed login
session alone, as they do on real Cognito. An application that clears its own cookies and revokes
the tokens has not signed the browser out of the hosted domain, and the sign-in link takes it
straight back in with no password. Sending the browser to `/logout` is what ends it.

Nobody is signed out at the identity provider, which real Cognito also leaves undone. A user signed
out here is still signed in at Google.

### PKCE

An authorize request carrying a `code_challenge` and a `code_challenge_method` of `S256` gets a code
that only the matching `code_verifier` exchanges. `plain` is refused, as it is by real Cognito.

### Putting a web ACL in front of the domain

`AssociateWebACL` on simulated WAFv2 attaches a `REGIONAL` web ACL to a pool by its ARN, and the
pool's endpoints are then evaluated against it. A blocked request gets 403 and the endpoint behind
it never runs. A blocked sign-up creates no user. The two `.well-known` documents are covered along
with the hosted domain pages, and the `/<pool-id>/messages` listing is left outside. See
[protecting a Cognito user pool](https://yulinsim.dev/services/wafv2/#protecting-a-cognito-user-pool) for the whole
example, including the request body that Cognito withholds from AWS WAF at a hosted domain.

## Lambda triggers

A pool created with a `LambdaConfig` runs the functions it names as part of a sign-up, a sign-in or
a message. Each one is given the real event and has to return it, changed or not.

| Trigger              | Fires                                                                         | `triggerSource`                          |
| -------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| `PreSignUp`          | `SignUp`, before the pool takes the new user                                  | `PreSignUp_SignUp`                       |
| `PreSignUp`          | `AdminCreateUser`, before the pool takes the new user                         | `PreSignUp_AdminCreateUser`              |
| `PostConfirmation`   | `ConfirmSignUp` and `AdminConfirmSignUp`, once the user is `CONFIRMED`        | `PostConfirmation_ConfirmSignUp`         |
| `PostConfirmation`   | `ConfirmForgotPassword`, once the reset has confirmed the user                | `PostConfirmation_ConfirmForgotPassword` |
| `PreAuthentication`  | a sign-in, once the user is known and before its password is checked          | `PreAuthentication_Authentication`       |
| `PreTokenGeneration` | a sign-in, where the claims of its tokens are settled                         | `TokenGeneration_Authentication`         |
| `PreTokenGeneration` | the sign-in that finishes by answering the new password challenge             | `TokenGeneration_NewPasswordChallenge`   |
| `PreTokenGeneration` | a `REFRESH_TOKEN_AUTH` refresh, over the tokens it reissues                   | `TokenGeneration_RefreshTokens`          |
| `PostAuthentication` | a sign-in, once the tokens have been issued                                   | `PostAuthentication_Authentication`      |
| `CustomMessage`      | `SignUp`, before the verification message is recorded                         | `CustomMessage_SignUp`                   |
| `CustomMessage`      | `ResendConfirmationCode`, before the message is recorded                      | `CustomMessage_ResendCode`               |
| `CustomMessage`      | `AdminCreateUser`, before the invitation is recorded                          | `CustomMessage_AdminCreateUser`          |
| `CustomMessage`      | an MFA code, before the text message is recorded                              | `CustomMessage_Authentication`           |
| `CustomMessage`      | `ForgotPassword` and `AdminResetUserPassword`, before the message is recorded | `CustomMessage_ForgotPassword`           |

`CustomMessage` is the one whose response is read for more than a flag, and it is covered in
[The CustomMessage trigger](#the-custommessage-trigger) above. The rest are here.

The function is a simulated Lambda function anywhere in the simulation, and it has to admit
`cognito-idp.amazonaws.com` for the pool. `AddPermission` grants that, and CDK's `addTrigger` emits
an `AWS::Lambda::Permission` for it.

A `LambdaConfig` ARN can carry a version number or an alias name on the end, and the trigger runs the
version that qualifier names. The permission is made on the same qualifier:

```typescript sim-cognito-trigger-alias
/**
 * A user pool whose PreSignUp trigger names a Lambda alias, so sign-ups run the
 * version the alias points at.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AddPermissionCommand,
  CreateAliasCommand,
  CreateFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();
const cognito = simAws.cognitoIdentityProvider();
const triggerArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:auth-trigger`;

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "auth-trigger",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/TriggerRole`,
    Code: {
      ZipFile: makeLambdaZipFileInput((event, context) => {
        console.log(context.functionVersion); // "1", the version behind `live`

        // A trigger hands the event back, changed or not.
        return event;
      }),
    },
  }),
);

const published = await lambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "auth-trigger" }),
);

await lambda.createAlias(
  new CreateAliasCommand({
    FunctionName: "auth-trigger",
    Name: "live",
    FunctionVersion: published.Version,
  }),
);

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    LambdaConfig: { PreSignUp: `${triggerArn}:live` },
  }),
);

await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "auth-trigger",
    Qualifier: "live",
    StatementId: "AllowCognito",
    Action: "lambda:InvokeFunction",
    Principal: "cognito-idp.amazonaws.com",
    SourceArn: pool.UserPool!.Arn!,
  }),
);

const client = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: pool.UserPool!.Id!,
    ClientName: "web",
  }),
);

await cognito.signUp(
  new SignUpCommand({
    ClientId: client.UserPoolClient!.ClientId!,
    Username: "alice",
    Password: "Sup3rSecret!",
  }),
);
```

The qualifier is resolved when the trigger fires, the same way the function itself is, so the pool
can be created before either exists. One naming no version and no alias refuses the sign-in with
`UnexpectedLambdaException`, and the message says what it reached for.

### Sign-up triggers

`PreSignUp` runs before the pool takes the new user. A handler that throws refuses the sign-up with
`UserLambdaValidationException` and leaves no user behind. `PostConfirmation` runs once the user has
reached `CONFIRMED`, and is given its attributes with the `sub` the pool allocated among them, which
a handler keys an external record on.

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
the user was confirmed. Asking to verify an attribute the sign-up left out refuses the sign-up, as
it does on real Cognito, rather than creating a user with the flag quietly unset.

A user confirmed that way still reaches `PostConfirmation`, at sign-up and not at a
`ConfirmSignUp` that never comes. A project whose users never confirm is covered by that, here as on
real Cognito.

`AdminCreateUser` reaches `PreSignUp` and never reaches `PostConfirmation`. That matters more than
it looks. `AdminCreateUser` is the obvious place to hang the trigger and the wrong one, and a
project relying on it would pass here and write nothing in production. What the handler wrote into
the response is ignored on that occasion too, because an admin-created user is already past
confirmation. Real Cognito ignores all three flags there.

The `ValidationData` and `ClientMetadata` a request carries reach the handler. `SignUp` and
`AdminCreateUser` pass both to `PreSignUp`, as `request.validationData` and
`request.clientMetadata`. `ConfirmSignUp` and `AdminConfirmSignUp` pass their `ClientMetadata` to
`PostConfirmation`. Neither is stored on the user, as on real Cognito.

The admin operations have no app client to name. A handler fired by `AdminCreateUser` or
`AdminConfirmSignUp` reads `callerContext.clientId` as `CLIENT_ID_NOT_APPLICABLE`, which real
Cognito sends.

### Sign-in triggers

`PreAuthentication` runs once the user is known and before its password is checked, so a wrong
password reaches it too. The trigger is given the user to decide about, and deciding is what it is
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
`request` holds `userAttributes` as a plain object of strings, not the `Name`/`Value` pairs the
API answers with.

`sub` is among those attributes everywhere except `PreSignUp`, where the user is yet to exist. On
real Cognito the sub is allocated once the sign-up has got past that handler. A handler keying an
external record on `sub` has to be a `PostConfirmation` one, here as there.

Three failures are reported the way real Cognito reports them:

- A handler that throws fails the request with `UserLambdaValidationException`, carrying the message
  it threw. For `PreSignUp` and `PreAuthentication` that is how the trigger turns the request down.
- A trigger naming a function the simulation lacks, or one whose resource policy withholds
  `cognito-idp.amazonaws.com` for the pool, fails with `UnexpectedLambdaException`.
- A handler that returns something other than the event it was given fails with
  `InvalidLambdaResponseException`.

Only the triggers in the table above run. Every other `LambdaConfig` key is refused when the pool is
created or updated, naming the trigger. A pool never quietly drops one.

## Custom claims from a token trigger

`PreTokenGeneration` decides what the pool puts on a token. The handler writes
`response.claimsOverrideDetails`, and the id token is signed with what it asked for.
`claimsToAddOrOverride` adds or replaces a claim, `claimsToSuppress` removes one, and
`groupOverrideDetails.groupsToOverride` replaces the `cognito:groups` claim. The group override
reaches the access token too, the one change a `V1_0` trigger makes to one.

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
for `REFRESH_TOKEN_AUTH`. A refresh runs the handler again. A claim that changed since the
sign-in is on the reissued token, never stale for the life of the session.

The request the handler is given carries `userAttributes`, a `groupConfiguration.groupsToOverride`
holding the groups the user is in, and, from a challenge response, `clientMetadata`. Real Cognito
passes `ClientMetadata` to this trigger from `RespondToAuthChallenge` and
`AdminRespondToAuthChallenge` only, and not from `InitiateAuth` or `AdminInitiateAuth`.

A response naming something this simulation would have to drop is refused with
`InvalidLambdaResponseException` rather than applied in part:

- A reserved claim in `claimsToAddOrOverride` or `claimsToSuppress`, such as `sub`, `aud`, `iss`,
  `token_use`, `exp`, `iat` or `auth_time`. Real Cognito ignores an override of one. A handler that
  appeared to work here would have no effect deployed.
- Any `cognito:` claim in `claimsToAddOrOverride`. `cognito:groups` is changed through
  `groupOverrideDetails` instead, and the refusal says so.
- `groupOverrideDetails.iamRolesToOverride` or `preferredRole`, because the `cognito:roles` and
  `cognito:preferred_role` claims they feed go unissued here.
- A claim value of any other type than a string. Complex claim values arrived with the `V2_0`
  event, which is outside the simulation.

## Token timestamps and expiry

`iat`, `exp` and `auth_time` come from the simulation's clock, not the host's, and the tokens
last the hour a pool's tokens last unless the app client says otherwise.

That makes an expired token something a test can produce. Sign the user in with the simulated clock
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

Advancing the clock after a sign-in is a different thing. It moves what the simulation calls now,
and the timestamps on tokens issued after it, but a verifier reading the host clock still judges a
token it already holds by host time. Signing in in the past is what produces a token such a verifier
refuses.

## Pool ARNs and IAM policies

A pool ARN is the pool id after `userpool/`, and the region appears twice:
`arn:aws:cognito-idp:eu-west-2:111111111111:userpool/eu-west-2_aBcDeFgHi`.

App clients have no ARN of their own. Every app client operation authorizes against the ARN of the
pool the client belongs to. A policy granting `cognito-idp:DescribeUserPoolClient` on a pool reaches
every client in it. There is no way to narrow it to one client, here or on real AWS.

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
resource-level permissions. They authorize against `*` here, and a policy naming individual pool
ARNs grants nothing.

The client-side operations are the other exception. `InitiateAuth`, `RespondToAuthChallenge` and
`GlobalSignOut` authorize against no resource at all, because real Cognito evaluates no IAM policy
for them. They are what an application calls on behalf of a user, holding no AWS credentials. A
`caller` goes unread on those three, and the tokens or the app client id are what authorizes them.

That is the difference the two sign-in paths make to a policy. Code calling `AdminInitiateAuth`
needs `cognito-idp:AdminInitiateAuth` on the pool, and code calling `InitiateAuth` needs no policy
statement at all. The same goes for `AdminRespondToAuthChallenge` against `RespondToAuthChallenge`,
and for `AdminUserGlobalSignOut` against `GlobalSignOut`.

## Listing pools and clients

`ListUserPools` requires `MaxResults`, as the real API does. A request without it is refused, never
answered with a default.

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
`AWS::Cognito::UserPoolGroup` deploy into simulated Cognito. A stack that already declares a pool
needs no duplicating in SDK calls to be tested.

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

const userPoolId = stack.output("UserPoolId");
const clientId = stack.output("ClientId");

console.log(userPoolId); // "eu-west-2_aBcDeFgHi"
console.log(stack.output("ProviderUrl"));
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
with an `https://` prefix, also the `iss` claim of the tokens the pool issues.

An app client publishes no `ClientSecret` attribute, because real CloudFormation publishes none.
Read the secret with `DescribeUserPoolClient`, which reports it here as it does on real Cognito.

The properties each type reads are the ones this simulation models:

- `AWS::Cognito::UserPool`: `UserPoolName`, `Policies`, `DeletionProtection`, `LambdaConfig`,
  `AdminCreateUserConfig`, `AutoVerifiedAttributes`, `UsernameAttributes`, `Schema`,
  `MfaConfiguration`, `EnabledMfas`, `UserPoolTier`, `AccountRecoverySetting`,
  `EmailConfiguration`, `EmailVerificationMessage`, `EmailVerificationSubject`,
  `SmsVerificationMessage` and `VerificationMessageTemplate`. `LambdaConfig` is read a trigger at a time. A template naming a
  trigger this simulation runs deploys, and one naming a trigger it lacks fails the stack.
  `UsernameAttributes` is what a CDK `UserPool` emits for its `signInAliases`, and a stack building
  an email sign-in pool deploys one that [identifies its
  users](#signing-in-by-email-or-phone-number) the way a deployed one would. `Schema` is what a CDK
  `UserPool` emits for its `customAttributes` and its `standardAttributes`, and a stack keying its
  own data on a `custom:` attribute deploys with the sign-up it was built for working.
  `MfaConfiguration` and `EnabledMfas` are deployed in a `SetUserPoolMfaConfig` call once the pool
  exists, the way real CloudFormation deploys them and why a stack declaring MFA needs
  `cognito-idp:SetUserPoolMfaConfig` on its execution role. A template asking for neither makes no
  such call. `AccountRecoverySetting` is recorded as the template declared it, and a setting outside
  the shape Cognito states fails the stack. `EmailConfiguration` is what a CDK `UserPool` emits for
  its `email`, and a template naming `EmailSendingAccount: DEVELOPER` deploys a pool that [sends
  through simulated SES](#sending-a-pools-email-through-ses). The last four are the wording of the
  messages the pool records.
- `AWS::Cognito::UserPoolClient`: `UserPoolId`, `ClientName`, `GenerateSecret`, `ExplicitAuthFlows`,
  `PreventUserExistenceErrors`, `AccessTokenValidity`, `IdTokenValidity`, `RefreshTokenValidity`,
  `AuthSessionValidity`, `RefreshTokenRotation`, `TokenValidityUnits`,
  `AllowedOAuthFlowsUserPoolClient`,
  `AllowedOAuthFlows`, `AllowedOAuthScopes`, `CallbackURLs`, `LogoutURLs`, `DefaultRedirectURI` and
  `SupportedIdentityProviders`.
- `AWS::Cognito::UserPoolGroup`: `UserPoolId`, `GroupName`, `Description`, `Precedence` and
  `RoleArn`.
- `AWS::Cognito::UserPoolDomain`: `UserPoolId`, `Domain`, `CustomDomainConfig` and
  `ManagedLoginVersion`. `Ref` returns the domain string, and `Fn::GetAtt CloudFrontDistribution`
  the distribution name, which only a custom domain has.
- `AWS::Cognito::UserPoolIdentityProvider`: `UserPoolId`, `ProviderName`, `ProviderType`,
  `ProviderDetails`, `AttributeMapping` and `IdpIdentifiers`. `Ref` returns the provider name.

Any other property is left out of what is created and recorded in
[`stack.ignoredProperties`](https://yulinsim.dev/services/cloudformation/#properties-a-resource-was-created-without),
naming the logical id, the property and the ones this can act on instead. The pool or client is
created either way. A stack full of Cognito resources deploys, and the record says which of them
behaves differently to the template. A stack that forgets `ALLOW_ADMIN_USER_PASSWORD_AUTH` still
fails at the sign-in here as it would in a deployment, the point of deploying the template at
all.

A property one of the Cognito commands refuses by name is recorded in that command's own words.
`SmsConfiguration` and `SmsAuthenticationMessage` on a pool, and `AnalyticsConfiguration`,
`EnablePropagateAdditionalUserContextData`, `ReadAttributes` and `WriteAttributes` on a client, all
read as the refusal reads:

```
AWS::Cognito::UserPool property SmsConfiguration is not simulated: SMS delivery would be ignored here and applied on real AWS. The Resource is created without it.
```

`CreateUserPool` refuses that same input outright, and the template deploys. The two paths say the
same thing about the property and differ in what they do about it. A direct API call has one
request to fail, and a template has every other resource in it to think about.

`UserPoolName` and `ClientName` are optional. A template that sets neither gets
`<stack name>-<logical id>-<tail>`, as real CloudFormation generates a name, trimmed to the 128
characters Cognito allows if the parts are longer than that together. The tail is twelve characters
derived from the other two, where real CloudFormation ends the name in twelve random ones. The name
is the same on every deployment of the same template, and [the CloudFormation docs](https://yulinsim.dev/services/cloudformation/#names-cloudformation-generates "Names CloudFormation generates")
cover how a long name is trimmed.

## Registering a pool with a chosen pool id

`CreateUserPoolCommand` allocates its own pool id, as real Cognito does, and takes none from you.
`CreateUserPoolClientCommand` allocates the app client id the same way. When something else already
decided either, register the pool and the app client as part of your test setup.

The usual reason is a CDK app whose pool lives in one stack and whose Lambda function lives in
another, with the two deliberately not joined by a CloudFormation export. Both ids reach the
synthesized template as literal strings, the pool id in the function's environment and the pool ARN
in its execution role's policy. Registering the pool and the client first lets that template deploy
as it is, with no rewriting.

```typescript sim-cognito-register-user-pool
/**
 * Registering a simulated Cognito user pool and app client with chosen ids.
 */

import { DescribeUserPoolClientCommand } from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
const cognito = simAws.cognitoIdentityProvider();

// The ids the CDK app pins, the stack that creates the pool being another one.
cognito.registerUserPool({
  id: "eu-west-2_aBcDeFgHi",
  name: "myapp-users",
  settings: { Policies: { PasswordPolicy: { MinimumLength: 12 } } },
});

cognito.registerUserPoolClient({
  userPoolId: "eu-west-2_aBcDeFgHi",
  id: "examplewebclient0000000000",
  name: "web",
  settings: { ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"] },
});

const described = await cognito.describeUserPoolClient(
  new DescribeUserPoolClientCommand({
    UserPoolId: "eu-west-2_aBcDeFgHi",
    ClientId: "examplewebclient0000000000",
  }),
);

console.log(described.UserPoolClient?.ClientName);
```

A registered pool behaves like any other. It answers `DescribeUserPoolCommand` and
`ListUserPoolsCommand`, holds users, groups and app clients, and serves its JWKS and OpenID
configuration on localhost. Everything written against a pool id follows from the id it was
registered under: its ARN, its issuer URL, the `iss` claim of its tokens and its `ProviderName`. A
policy naming `arn:aws:cognito-idp:eu-west-2:111111111111:userpool/eu-west-2_aBcDeFgHi` authorizes
the handler that reads the pool, which is what a template carrying the id in two places needs.

`registerUserPool` takes the same optional `settings` as `CreateUserPoolCommand`, and
`registerUserPoolClient` the same optional `settings` as `CreateUserPoolClientCommand`, with
`ClientName` given as `name`. A registered app client signs users in through `InitiateAuthCommand`,
which names no pool and finds one from the client id alone.

Registration is refused rather than allowed to produce a pool no real Cognito matches:

- A pool id another pool holds, whether it was registered or created, gives
  `UserPoolAlreadyExists`.
- A client id another pool in the simulation holds gives `UserPoolClientAlreadyExists`. That lookup
  from a client id to a pool is what `InitiateAuth` makes, and two pools sharing a client id would
  make it ambiguous.
- A value that is no pool id or client id gives `InvalidParameterException`.
- A pool id naming another Region gives `InvalidParameterException`, saying which simulated Cognito
  to register it on. A pool id carries the Region its pool lives in, and the ARN carries the Region
  of the simulated Cognito holding it, so crossing the two would name two Regions in one pool.

## Properties accepted without being simulated

A CDK `UserPool` construct emits six properties on `AWS::Cognito::UserPool` before it has been asked
for anything, and a client created with `disableOAuth` emits two on `AWS::Cognito::UserPoolClient`.
Most of them are simulated: `AdminCreateUserConfig` decides whether `SignUp` works against the pool,
and the four verification wording properties are what a recorded message says.

`AccountRecoverySetting` is the exception. `ForgotPassword` sends its code to an attribute the pool
verifies automatically, so the mechanisms a pool ranked decide nothing here. The pool records the
mechanisms it was asked for and `DescribeUserPool` reports them back, so what a template declared
stays visible. The two app client properties are accepted at one value each instead.

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

const userPoolId = stack.output("PoolId");

// The pool is named after the stack, the logical id and a tail derived from
// both, as the template named neither it nor the client.
const described = await simAws
  .cognitoIdentityProvider()
  .describeUserPool(new DescribeUserPoolCommand({ UserPoolId: userPoolId }));

console.log(described.UserPool?.Name); // "app-stack-Pool-2c3041dc539d"

// What the template declared is reported back. This one is acted on: it is
// what says only an admin creates users in this pool.
console.log(described.UserPool?.AdminCreateUserConfig);
// { AllowAdminCreateUserOnly: true }

// So is this one: it is what a verification message the pool records says.
console.log(described.UserPool?.EmailVerificationSubject);
// "Verify your new account"
```

The accepted value of each app client property is below. A pool or a client created without one of
these reports it not at all, and never reports the value it would have had to use.

| Property                          | Accepted value |
| --------------------------------- | -------------- |
| `AllowedOAuthFlowsUserPoolClient` | `false`        |
| `SupportedIdentityProviders`      | `["COGNITO"]`  |

`AccountRecoverySetting` takes any mechanisms Cognito has, in any order: `verified_email`,
`verified_phone_number` and `admin_only`. Email-only recovery is the one worth naming, because it is
what goes with a pool that sends no SMS, and CDK writes it for `AccountRecovery.EMAIL_ONLY`.

```typescript sim-cognito-account-recovery
/**
 * Creating a pool that recovers an account by email alone.
 */

import {
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const cognito = new SimAws().cognitoIdentityProvider();

const created = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    AccountRecoverySetting: {
      RecoveryMechanisms: [{ Name: "verified_email", Priority: 1 }],
    },
  }),
);

const userPoolId = created.UserPool?.Id;

// The pool reports back the mechanisms it was asked for, rather than the two
// real Cognito gives a pool that asked for none.
const described = await cognito.describeUserPool(
  new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
);

console.log(described.UserPool?.AccountRecoverySetting);
// { RecoveryMechanisms: [{ Name: "verified_email", Priority: 1 }] }
```

The setting is held to the shape real Cognito states for it, because a pool created outside that
shape would exist here and fail to be created on real AWS. A list of mechanisms carries one or two
of them, each naming a mechanism Cognito has at a priority of 1 or 2. The refusal says which of
those it was.

`VerificationMessageTemplate` is read and never compared, and the one thing refused in it is
`DefaultEmailOption: CONFIRM_WITH_LINK`, along with `EmailMessageByLink` and `EmailSubjectByLink`.
Nothing here serves a link, and `ConfirmSignUp` with the code is the only way a user is confirmed. A
pool that asked for a link would be tested against a flow it lacks in a deployment.

## Serving a pool's JWKS on localhost

`serveSimAws` serves the two public endpoints of every simulated pool:

- `GET /<userPoolId>/.well-known/jwks.json`
- `GET /<userPoolId>/.well-known/openid-configuration`

It also lists the messages a pool would have sent, at `GET /<userPoolId>/messages`, an endpoint
real Cognito lacks. That one is anonymous too, and it hands out confirmation codes and
temporary passwords to anyone who asks, so serve a simulation on a port other people can reach only
if you mean to.

The two real endpoints are anonymous as they are on real Cognito, and no SigV4 signature is needed
to fetch them. The real hostname `cognito-idp.<region>.amazonaws.com` maps to
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
pool id rather than taking one, leaving it impossible to point at the local URL. Fetching the
document and calling `cacheJwks` with it is one way round that. The other is to hand the verifier a
`SimpleJwksCache` from `aws-jwt-verify/jwk` whose fetcher passes the URI through `srv.localUrl`,
which leaves the verifier setup in the application untouched. A verifier that takes a `jwksUri` and
accepts plain HTTP can be pointed at the local URL as it is.

The OpenID configuration names the origin the request arrived on in `issuer` and `jwks_uri`. A
client that discovers the document can go on to fetch the keys it points at. The tokens keep the
real `https://cognito-idp.<region>.amazonaws.com/<userPoolId>` in `iss`, what a verifier built from
a pool id checks against. The two disagree here where they agree on real Cognito.

A [simulated Lambda](https://yulinsim.dev/services/lambda/#verifying-a-cognito-token-in-a-handler "Simulated Lambda usage docs")
reads both documents at the real regional endpoint, with no local server and no URL rewriting. A
`CognitoJwtVerifier` inside a handler fetches the pool's JWKS for itself and verifies the token,
which is the verifier setup the deployed code already has.

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
dispatched with the function's execution role as the caller. The role's policy decides whether the
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
request leaves out goes back to the default `CreateUserPool` would have given it. A request that
names only the one setting it wants to change resets the others. Name every setting the pool should
keep. That is the sharp edge on real Cognito too, and a request written that way behaves the same
here and in a deployment.

A pool's `LambdaConfig` is replaced the same way. An update that says nothing about it stops the
pool running the triggers it was created with, as real Cognito would.

The pool's name falls outside the settings an update carries. Real `UpdateUserPool` renames a pool
with `PoolName`, and a rename is outside the simulation. A request carrying one is refused. Every
other input `CreateUserPool` refuses is refused here too, in the same words, saying
`UpdateUserPool`.

`UpdateUserPool` answers with the response metadata alone, as the real operation does, so
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

A pool created through the API is unprotected unless the request asks for protection, the opposite
of what the console does. A pool created with `DeletionProtection: "ACTIVE"` refuses
`DeleteUserPool` with `InvalidParameterException`.

Real Cognito wants an `UpdateUserPool` request deactivating the protection before the pool can go,
and so does this. Send an `UpdateUserPool` with `DeletionProtection: "INACTIVE"` first, then delete
the pool.

## Multi-factor authentication

A pool can be created with an `MfaConfiguration` of `OFF`, `OPTIONAL` or `ON`, and reports back what
it was asked for. `SetUserPoolMfaConfig` sets which factors are behind that setting, and
`GetUserPoolMfaConfig` reads both back, as they do on real Cognito. `SOFTWARE_TOKEN_MFA` and
`SMS_MFA` are the factors a pool can offer. A code sent by email is refused, because no pool here
has the `EmailConfiguration` real Cognito wants before it will send one, and so is the
`SmsConfiguration` inside an `SmsMfaConfiguration`. No message is delivered here, and the IAM role
that would send one is never assumed.

A pool configured `OPTIONAL` challenges the users that have registered a factor, and one configured
`ON` challenges every user. A pool configured `OFF` challenges nobody. What a user registered is
covered in [Registering a second factor for a user](#registering-a-second-factor-for-a-user) below,
and being challenged for it in [Signing in with a second
factor](#signing-in-with-a-second-factor) after that.

The one sign-in still refused is by a user of an `ON` pool that has registered no factor at all.
Real Cognito answers that one with `MFA_SETUP`, which registers a factor mid-sign-in, so
`InitiateAuth`, `AdminInitiateAuth` and the new password challenge response are refused with
`InvalidParameterException` where that challenge would have been, rather than handing out tokens a
deployment would not.

```typescript sim-cognito-mfa
/**
 * A user pool that offers multi-factor authentication.
 */

import {
  ConfirmSignUpCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
  GetUserPoolMfaConfigCommand,
  InitiateAuthCommand,
  SetUserPoolMfaConfigCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const cognito = new SimAws().cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    MfaConfiguration: "OPTIONAL",
  }),
);
const userPoolId = pool.UserPool!.Id!;

// Which factors the pool offers is set separately, as it is on real Cognito.
await cognito.setUserPoolMfaConfig(
  new SetUserPoolMfaConfigCommand({
    UserPoolId: userPoolId,
    MfaConfiguration: "OPTIONAL",
    SoftwareTokenMfaConfiguration: { Enabled: true },
  }),
);

const described = await cognito.describeUserPool(
  new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
);

console.log(described.UserPool?.MfaConfiguration); // "OPTIONAL"

const mfa = await cognito.getUserPoolMfaConfig(
  new GetUserPoolMfaConfigCommand({ UserPoolId: userPoolId }),
);

console.log(mfa.SoftwareTokenMfaConfiguration?.Enabled); // true

// A user of the pool signs up and signs in with a password alone, because no
// user here has registered a second factor.
const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
  }),
);
const clientId = appClient.UserPoolClient!.ClientId!;

await cognito.signUp(
  new SignUpCommand({
    ClientId: clientId,
    Username: "alice",
    Password: "Sup3rSecret!",
  }),
);

await cognito.confirmSignUp(
  new ConfirmSignUpCommand({
    ClientId: clientId,
    Username: "alice",
    ConfirmationCode: cognito.userPool(userPoolId).confirmationCode("alice"),
  }),
);

const signedIn = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
  }),
);

console.log(typeof signedIn.AuthenticationResult?.AccessToken); // "string"
```

### Registering a second factor for a user

A user registers an authenticator app in the three steps Cognito's own documentation gives.
`AssociateSoftwareToken` issues a `SecretCode`, `VerifySoftwareToken` proves the app holds it, and
`SetUserMFAPreference` turns the factor on. `AdminSetUserMFAPreference` does the same for a user an
administrator names, and `AdminGetUser` and `GetUser` report the result as `UserMFASettingList` and
`PreferredMfaSetting`.

Each of those, and `GetUser`, is authorized by the user's own access token rather than by any IAM
policy, and the token has to carry the `aws.cognito.signin.user.admin` scope. A sign-in through the
API always carries it. A sign-in at the hosted domain carries it only where the app client asked for
it among its `AllowedOAuthScopes`. A browser sign-in granted `openid email` alone is refused with
`NotAuthorizedException`, as real Cognito refuses one. `GlobalSignOut` is held to the same rule.

The `SecretCode` is a real RFC 6238 shared secret. An authenticator app or any TOTP library given
it produces the codes `VerifySoftwareToken` accepts, and a code from another secret is refused with
`EnableSoftwareTokenMFAException`. A test that would rather not compute one reads the code the
user's app would be showing off the pool, through `SimCognitoUserPool.softwareTokenCode`, in the way
it reads a sign-up confirmation code. Real Cognito reports neither to anyone, and nothing here is
holding the user's phone.

Verifying a token registers it and leaves it disabled. `SetUserMFAPreference` is what turns a factor
on, the step the Cognito documentation gives for activating one. Whether real Cognito also activates
a TOTP factor on verification alone was not checked against a live account. Enabling `SMS_MFA` for a
user with no `phone_number` attribute is refused, because there would be nowhere to send the code,
and so is enabling `SOFTWARE_TOKEN_MFA` for a user that has verified no token. A factor a request
says nothing about is left as it was, and an application turning on an authenticator app can leave
what it wants for SMS unstated. One factor at most is preferred, and preferring one means enabling
it in the same request.

```typescript sim-cognito-user-mfa
/**
 * Registering an authenticator app for a user of a simulated pool.
 */

import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AssociateSoftwareTokenCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  GetUserCommand,
  InitiateAuthCommand,
  SetUserMFAPreferenceCommand,
  SetUserPoolMfaConfigCommand,
  VerifySoftwareTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const cognito = new SimAws().cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    MfaConfiguration: "OPTIONAL",
  }),
);
const userPoolId = pool.UserPool!.Id!;

await cognito.setUserPoolMfaConfig(
  new SetUserPoolMfaConfigCommand({
    UserPoolId: userPoolId,
    MfaConfiguration: "OPTIONAL",
    SoftwareTokenMfaConfiguration: { Enabled: true },
  }),
);

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
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
const AccessToken = signedIn.AuthenticationResult!.AccessToken!;

// The secret an authenticator app would be given, behind a QR code.
const associated = await cognito.associateSoftwareToken(
  new AssociateSoftwareTokenCommand({ AccessToken }),
);

console.log(typeof associated.SecretCode); // "string"

// The code the user's app is showing, which a test reads off the pool rather
// than computing from the secret itself.
const verified = await cognito.verifySoftwareToken(
  new VerifySoftwareTokenCommand({
    AccessToken,
    UserCode: cognito.userPool(userPoolId).softwareTokenCode("alice"),
  }),
);

console.log(verified.Status); // "SUCCESS"

// Verifying registers the token. Turning the factor on is a step of its own.
await cognito.setUserMFAPreference(
  new SetUserMFAPreferenceCommand({
    AccessToken,
    SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
  }),
);

const user = await cognito.getUser(new GetUserCommand({ AccessToken }));

console.log(user.UserMFASettingList); // ["SOFTWARE_TOKEN_MFA"]
console.log(user.PreferredMfaSetting); // "SOFTWARE_TOKEN_MFA"
```

### Signing in with a second factor

A sign-in by a user that has registered a factor is answered with `SMS_MFA` or `SOFTWARE_TOKEN_MFA`
and a `Session` in place of tokens, on `InitiateAuth` and `AdminInitiateAuth` alike, and after
a `NEW_PASSWORD_REQUIRED` response as well, one challenge following the other. The code goes back
through `RespondToAuthChallenge` or `AdminRespondToAuthChallenge` as `SMS_MFA_CODE` or
`SOFTWARE_TOKEN_MFA_CODE`, and that request is what hands out the tokens.

An `SMS_MFA` challenge carries `CODE_DELIVERY_DELIVERY_MEDIUM` and a masked
`CODE_DELIVERY_DESTINATION` in its `ChallengeParameters`, as real Cognito does, and the pool records
the message it would have texted, on an occasion of `Authentication`. That is where a test reads the
code from, the way it reads a sign-up confirmation code. A `SOFTWARE_TOKEN_MFA` challenge sends
nothing anywhere. The code is whatever the user's authenticator app is showing, and a test computes
it from the `SecretCode` or reads it off the pool.

The code goes to the user's `phone_number` whatever the pool's `AutoVerifiedAttributes` say, and to
the phone number, not the email address, of a user that has both, because the phone is the
factor.

A wrong code is refused with `CodeMismatchException` and leaves the challenge standing. The user can
be asked to type it again. How long a session lasts is the app client's `AuthSessionValidity`,
three minutes on a client that asked for none. A session that has run out, one already spent, and
one issued for a different challenge are each refused with `NotAuthorizedException`.

`PostAuthentication` runs where the tokens are issued, the response rather than the sign-in that
was challenged. `PreTokenGeneration` runs there too, reporting
`TokenGeneration_Authentication`, including for a sign-in that answered the new password challenge
before this one. Which source real Cognito reports for that pair of challenges was not checked
against a live account.

A user with both factors enabled and neither preferred is refused. Real Cognito answers that
sign-in with `SELECT_MFA_TYPE`, a challenge of its own. `SetUserMFAPreference` naming one
of them as `PreferredMfa` is what settles it.

```typescript sim-cognito-mfa-sign-in
/**
 * Signing in with a code texted to the user's phone.
 */

import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  SetUserMFAPreferenceCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const cognito = new SimAws().cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    MfaConfiguration: "OPTIONAL",
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
const ClientId = appClient.UserPoolClient!.ClientId!;

// The code has somewhere to go, which is what enabling SMS_MFA needs.
await cognito.adminCreateUser(
  new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    UserAttributes: [{ Name: "phone_number", Value: "+441632960123" }],
  }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    Password: "Sup3rSecret!",
    Permanent: true,
  }),
);

const signIn = new InitiateAuthCommand({
  ClientId,
  AuthFlow: "USER_PASSWORD_AUTH",
  AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
});

// This sign-in is not challenged: the user has registered no factor yet.
const first = await cognito.initiateAuth(signIn);

await cognito.setUserMFAPreference(
  new SetUserMFAPreferenceCommand({
    AccessToken: first.AuthenticationResult!.AccessToken,
    SMSMfaSettings: { Enabled: true, PreferredMfa: true },
  }),
);

const challenged = await cognito.initiateAuth(signIn);

console.log(challenged.ChallengeName); // "SMS_MFA"
console.log(challenged.ChallengeParameters?.["CODE_DELIVERY_DESTINATION"]);
// "+*******0123"

// Nothing is delivered, so the code is read out of the message the pool
// recorded, as a sign-up confirmation code is.
const texted = cognito
  .userPool(userPoolId)
  .sentMessages()
  .find((message) => message.occasion === "Authentication");
const code = /\d{6}/.exec(texted!.body)![0];

const signedIn = await cognito.respondToAuthChallenge(
  new RespondToAuthChallengeCommand({
    ClientId,
    ChallengeName: "SMS_MFA",
    Session: challenged.Session,
    ChallengeResponses: { USERNAME: "alice", SMS_MFA_CODE: code },
  }),
);

console.log(typeof signedIn.AuthenticationResult?.AccessToken); // "string"
```

## Registering a passkey

`StartWebAuthnRegistration` and `CompleteWebAuthnRegistration` register a passkey for the user whose
access token authorized the call. `ListWebAuthnCredentials` reads back what that user has, and
`DeleteWebAuthnCredential` forgets one. All four are authorized by the access token alone, and real
Cognito evaluates no IAM policy for any of them. That is what makes a passkey something a user adds
to an account it is already signed in to. The first one has to be registered from a session some
other factor started.

The pool needs a relying party before it can register anything. It arrives as
`WebAuthnConfiguration.RelyingPartyId` on `SetUserPoolMfaConfig`, or as `WebAuthnRelyingPartyID` on
an `AWS::Cognito::UserPool` Resource. A pool that names none falls back to its own hosted domain,
which is what real Cognito falls back to, and a pool with neither refuses the registration with
`WebAuthnConfigurationMissingException`.

`StartWebAuthnRegistration` answers with the `CredentialCreationOptions` a browser passes to
`navigator.credentials.create()`. They carry a fresh challenge, the relying party, the user handle
(the user's `sub`), the ECDSA P-256 algorithm the pool takes, and the passkeys the user already has
under `excludeCredentials`. Starting a second registration replaces the first, and the challenge the
browser was part way through answering is spent.

A test has no browser and no phone. The simulator plays the authenticator instead, and
`SimCognitoUserPool.webAuthnCredential` hands back the credential the user's own device would have
made from the options it was just given, in the way `softwareTokenCode` hands back the code an
authenticator app would be showing. Pass that credential to `CompleteWebAuthnRegistration`.

```typescript sim-cognito-passkey-registration
/**
 * Registering a passkey for a signed-in user.
 */

import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CompleteWebAuthnRegistrationCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
  ListWebAuthnCredentialsCommand,
  SetUserPoolMfaConfigCommand,
  StartWebAuthnRegistrationCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const cognito = new SimAws().cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool!.Id!;

// A passkey belongs to a domain, and the pool has to name the one it registers
// against.
await cognito.setUserPoolMfaConfig(
  new SetUserPoolMfaConfigCommand({
    UserPoolId: userPoolId,
    MfaConfiguration: "OPTIONAL",
    WebAuthnConfiguration: {
      RelyingPartyId: "myapp.example.com",
      UserVerification: "required",
    },
  }),
);

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
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

// A passkey is added from a session that already exists, so the user signs in
// with its password first.
const signedIn = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: appClient.UserPoolClient!.ClientId!,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
  }),
);
const AccessToken = signedIn.AuthenticationResult!.AccessToken!;

// The options a browser would hand to navigator.credentials.create().
await cognito.startWebAuthnRegistration(
  new StartWebAuthnRegistrationCommand({ AccessToken }),
);

// The credential that browser's authenticator would have handed back.
await cognito.completeWebAuthnRegistration(
  new CompleteWebAuthnRegistrationCommand({
    AccessToken,
    Credential: cognito.userPool(userPoolId).webAuthnCredential("alice"),
  }),
);

const listed = await cognito.listWebAuthnCredentials(
  new ListWebAuthnCredentialsCommand({ AccessToken }),
);

console.log(listed.Credentials?.[0]?.RelyingPartyId); // "myapp.example.com"
```

The keys are real. Every passkey is an ECDSA key pair over P-256, and the credential carries the
public half as base64url of its SubjectPublicKeyInfo, where a browser's own
`PublicKeyCredential.toJSON()` puts it. The pool reads the key itself rather than the algorithm the
credential names beside it, so an RSA key labelled `-7` is refused. A test that would rather hold
its own key can build the credential document by hand, because nothing here reads a field a browser
leaves out.

What the pool was sent is read rather than trusted. The client data has to name the ceremony, answer
the challenge the pool issued and carry the relying party's own origin, and the authenticator data
has to hash to the relying party the pool registers against. A spent or unknown challenge is refused
with `WebAuthnChallengeNotFoundException`, another origin with
`WebAuthnOriginNotAllowedException`, another domain with `WebAuthnRelyingPartyMismatchException`,
and a key the pool cannot use with `WebAuthnCredentialNotSupportedException`. A refusal spends the
challenge, so a registration that was refused is started again rather than retried.

`ListWebAuthnCredentials` reports each passkey with the credential id, the relying party, how the
authenticator says it is attached and how it can be reached, and when it was registered. It pages by
`MaxResults` and `NextToken`, twenty to a page at most, and a `MaxResults` of zero is read as the
whole page, which is what Cognito documents as its minimum. `FriendlyCredentialName` is the relying
party ID. Real Cognito reads the authenticator's own model out of the attestation and names the
credential after it, and this simulation parses no attestation.

## Signing in with a passkey

`InitiateAuth` and `AdminInitiateAuth` run the `USER_AUTH` flow. That is choice-based sign-in, and
it is the flow a passkey is presented through. An app client has to be created with
`ALLOW_USER_AUTH` among its `ExplicitAuthFlows` before either will run it.

A request naming only a `USERNAME` is answered with `SELECT_CHALLENGE` and an `AvailableChallenges`
list. The factors in it come from the pool's `Policies.SignInPolicy.AllowedFirstAuthFactors`,
narrowed to the ones this user could actually present. `WEB_AUTHN` appears once the user has
registered a passkey, and `EMAIL_OTP` and `SMS_OTP` where the user has the address or the number a
code would go to. A pool that named no policy allows a password, the fallback real Cognito
applies.

`RespondToAuthChallenge` picks one of them with an `ANSWER`. `WEB_AUTHN` is answered with the
`WEB_AUTHN` challenge and the options a browser presents a passkey against, and `PASSWORD` carries
the password in the same request and finishes the sign-in. A request that already knows which factor
it wants skips the choice by naming a `PREFERRED_CHALLENGE` of `PASSWORD` or `WEB_AUTHN`, and one
carrying a `PASSWORD` outright is signed in there and then.

A `WEB_AUTHN` challenge carries `CREDENTIAL_REQUEST_OPTIONS` in its `ChallengeParameters`, as JSON,
which is what a browser passes to `navigator.credentials.get()`. It names the relying party, the
passkeys this user has under `allowCredentials`, and the challenge the authenticator signs. A test has no browser.
`SimCognitoUserPool.webAuthnAssertion` reads the credential the user's own device would have handed
back, taking the `Session` the challenge answered with. The response goes back as `CREDENTIAL`, JSON
in the `ChallengeResponses`.

```typescript sim-cognito-passkey-sign-in
/**
 * Signing in with a registered passkey.
 */

import {
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import type { SimCognitoIdentityProvider } from "@kensio/yulin/cognito";

declare const cognito: SimCognitoIdentityProvider;
declare const userPoolId: string;
declare const clientId: string;

// The pool answers with the factors this user could sign in with. They are
// what its SignInPolicy allows, narrowed to what the user has.
const offered = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_AUTH",
    AuthParameters: { USERNAME: "alice" },
  }),
);

console.log(offered.ChallengeName); // "SELECT_CHALLENGE"
console.log(offered.AvailableChallenges); // ["PASSWORD", "WEB_AUTHN"]

// Choosing the passkey asks for one, carrying the options a browser would pass
// to navigator.credentials.get().
const challenged = await cognito.respondToAuthChallenge(
  new RespondToAuthChallengeCommand({
    ClientId: clientId,
    ChallengeName: "SELECT_CHALLENGE",
    Session: offered.Session,
    ChallengeResponses: { USERNAME: "alice", ANSWER: "WEB_AUTHN" },
  }),
);

console.log(challenged.ChallengeName); // "WEB_AUTHN"

// The credential that browser's authenticator would have signed, read off the
// pool because a test has neither.
const presented = cognito
  .userPool(userPoolId)
  .webAuthnAssertion(challenged.Session!);

const signedIn = await cognito.respondToAuthChallenge(
  new RespondToAuthChallengeCommand({
    ClientId: clientId,
    ChallengeName: "WEB_AUTHN",
    Session: challenged.Session,
    ChallengeResponses: {
      USERNAME: "alice",
      CREDENTIAL: JSON.stringify(presented),
    },
  }),
);

console.log(typeof signedIn.AuthenticationResult?.AccessToken); // "string"
```

The signature is checked against the public key the registration stored. A credential another key
signed is refused with `NotAuthorizedException`, and so is one presenting a passkey this user never
registered. The challenge session lasts the app client's `AuthSessionValidity` and is spent when it
is answered, as every other challenge session is.

A passkey finishes the sign-in on its own. Real Cognito counts one as having met the pool's MFA
requirement. A user that has registered a second factor presents its passkey and is signed in, where
the same user signing in with a password would answer for that factor first.

Choosing `EMAIL_OTP` or `SMS_OTP` is refused, because nothing here delivers a message. The pool
offers them where its policy allows them, and the refusal lands on the choice.

### A passkey at managed login

Managed login's sign-in form offers a passkey where the pool allows one at the first prompt, beside
the username and password it already asks for. It takes two requests, as it does on real managed
login.

Posting the form with that button is answered with a second page. The pool has issued a `WEB_AUTHN`
challenge by then, and the page carries the session it belongs to in a hidden `passkey_session`
input alongside a `credential` field. Posting that back signs the user in and sends the browser to
the application with an authorization code, which exchanges for tokens the way a password sign-in's
code does.

Real managed login runs the WebAuthn ceremony between the two requests, in the browser, with the
person's own authenticator. These pages serve no script, so the credential is a field on a form and
`SimCognitoUserPool.webAuthnAssertion` is where a test reads it from, passing the session the page
carried. The button alone signs nobody in. A passkey a caller does not hold is one it cannot
present, so knowing a username reaches the challenge and no further.

A credential the pool refuses sends the browser back to the sign-in form with the reason on it,
where a wrong password would land, and the sign-in starts again.

## Available functionality

Sim Cognito currently supports:

- `CreateUserPoolCommand`, `DescribeUserPoolCommand`, `UpdateUserPoolCommand`,
  `DeleteUserPoolCommand` and `ListUserPoolsCommand`
- `SetUserPoolMfaConfigCommand` and `GetUserPoolMfaConfigCommand`, which set and read what a pool
  offers as a second factor
- `CreateUserPoolClientCommand`, `DescribeUserPoolClientCommand`, `UpdateUserPoolClientCommand`,
  `DeleteUserPoolClientCommand` and `ListUserPoolClientsCommand`
- `AdminCreateUserCommand`, `AdminGetUserCommand`, `AdminDeleteUserCommand`,
  `AdminSetUserPasswordCommand`, `AdminUpdateUserAttributesCommand`, `AdminDisableUserCommand`,
  `AdminEnableUserCommand` and `ListUsersCommand`, and `GetUserCommand`, the signed-in user reading
  itself
- `AssociateSoftwareTokenCommand`, `VerifySoftwareTokenCommand` and `SetUserMFAPreferenceCommand`,
  which register an authenticator app for the signed-in user, and
  `AdminSetUserMFAPreferenceCommand`, which sets a named user's factors
- The `SMS_MFA` and `SOFTWARE_TOKEN_MFA` challenges, issued to a user that has registered the
  factor and answered through `RespondToAuthChallengeCommand` or
  `AdminRespondToAuthChallengeCommand`, with the texted code recorded as a message on the pool
- The `USER_AUTH` flow on both sides of the API, with the `SELECT_CHALLENGE`, `PASSWORD` and
  `WEB_AUTHN` challenges it issues, and the passkey a test presents read off the pool
- `StartWebAuthnRegistrationCommand`, `CompleteWebAuthnRegistrationCommand`,
  `ListWebAuthnCredentialsCommand` and `DeleteWebAuthnCredentialCommand`, which register and manage
  the signed-in user's passkeys, with the credential the user's own authenticator would have made
  read back off the pool
- `SignUpCommand`, `ConfirmSignUpCommand` and `ResendConfirmationCodeCommand`, authorized by no IAM
  policy as they are on real Cognito, and `AdminConfirmSignUpCommand`, authorized like the other
  admin operations
- `ForgotPasswordCommand` and `ConfirmForgotPasswordCommand`, authorized by no IAM policy either,
  with the reset code read back off the pool and the masked `CodeDeliveryDetails` reported, and
  `AdminResetUserPasswordCommand`, which leaves a user in `RESET_REQUIRED`
- The `PreSignUp` and `PostConfirmation` Lambda triggers, with `autoConfirmUser`, `autoVerifyEmail`
  and `autoVerifyPhone` applied, and with the `ValidationData` and `ClientMetadata` a request
  carries reaching the handler
- `AutoVerifiedAttributes`, so confirming a sign-up sets `email_verified` or
  `phone_number_verified`, and `AdminCreateUserConfig.AllowAdminCreateUserOnly`, which refuses
  `SignUp` against a pool created with it
- A pool's `Schema`, with a `custom:` attribute set and read on its users, held to the type, the
  bounds and the mutability it was declared with, and reported as `SchemaAttributes` alongside the
  standard attributes
- A pool's `AccountRecoverySetting`, recorded as the request set it and reported back by
  `DescribeUserPool`, held to the one or two mechanisms Cognito takes
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
- Real RS256 JWTs, signed by a key the pool publishes as a JWKS, verified unchanged by a verifier
  configured for the pool
- A pool's `.well-known/jwks.json` and `.well-known/openid-configuration` served over HTTP by
  `serveSimAws`, anonymously, letting a verifier fetch the keys instead of taking them by hand
- `CreateUserPoolDomainCommand`, `DescribeUserPoolDomainCommand` and
  `DeleteUserPoolDomainCommand`, for a Cognito prefix domain and for a custom domain
- `CreateIdentityProviderCommand`, `DescribeIdentityProviderCommand`,
  `UpdateIdentityProviderCommand`, `DeleteIdentityProviderCommand` and
  `ListIdentityProvidersCommand`
- The `/oauth2/authorize`, `/oauth2/token` and `/logout` endpoints of a pool's domain, served on the
  domain's own hostname, for an authorization code grant through an external identity provider,
  with PKCE and with a `refresh_token` grant
- An authorize request naming no identity provider, signing one of the pool's own users in from a
  `username` and a `password` it carries
- The managed login session a sign-in starts for the browser, held in the `cognito` cookie for an
  hour, signing a returning browser in without credentials until `/logout` ends it
- A served sign-in form at `/oauth2/authorize`, a sign-up form at `/signup`, a confirmation form at
  `/confirm`, and the two password reset forms at `/forgotPassword` and `/confirmForgotPassword`,
  each carrying the authorize parameters through to the next
- The pool user a federated sign-in creates, named `<ProviderName>_<subject>`, in the
  `EXTERNAL_PROVIDER` status, carrying the `identities` attribute and claim and the attributes the
  provider's `AttributeMapping` named
- A `REGIONAL` web ACL in front of the pool, attached by `AssociateWebACL` on simulated WAFv2 and
  evaluated against every request the hosted domain and the two `.well-known` documents answer
- App client OAuth settings: `AllowedOAuthFlowsUserPoolClient`, `AllowedOAuthFlows`,
  `AllowedOAuthScopes`, `CallbackURLs`, `LogoutURLs`, `DefaultRedirectURI` and
  `SupportedIdentityProviders`, each of which an authorize or token request is checked against
- `AWS::Cognito::UserPool`, `AWS::Cognito::UserPoolClient`, `AWS::Cognito::UserPoolGroup`,
  `AWS::Cognito::UserPoolDomain` and `AWS::Cognito::UserPoolIdentityProvider` deployed from a
  CloudFormation template, with the `Ref` and `Fn::GetAtt` values real CloudFormation returns
- Pool ids in the real `<region>_<nine characters>` form, and pool ARNs built from them
- `registerUserPool` and `registerUserPoolClient`, which stand a pool and an app client up under
  chosen ids, for a template that names ids another stack allocated
- The real default password policy, applied to the passwords users are given
- The real user status lifecycle, in which an admin-created user stays in `FORCE_CHANGE_PASSWORD`
  until it has a permanent password, a signed-up user stays in `UNCONFIRMED` until it confirms, and
  a user an administrator reset stays in `RESET_REQUIRED` until it sets a password of its own
- Group membership, and the precedence order the `cognito:groups` claim uses
- App client authentication flows, token lifetimes, generated client secrets and
  `PreventUserExistenceErrors`
- Refresh tokens that expire at the app client's `RefreshTokenValidity`, thirty days by default on
  the simulated clock
- Refresh token rotation on an app client, renewed with `GetTokensFromRefreshToken`, including the
  `RetryGracePeriodSeconds` a rotated-out token keeps working for
- Authorization of the administrative operations by simulated IAM, against the real IAM action and
  ARN
- Calls made from inside a simulated Lambda handler, authorized as the function's execution role

## Limitations

Current documented limitations:

- Five authentication flows run: `ADMIN_USER_PASSWORD_AUTH` and `REFRESH_TOKEN_AUTH` through
  `AdminInitiateAuth`, `USER_PASSWORD_AUTH` and `REFRESH_TOKEN_AUTH` through `InitiateAuth`, and
  `USER_AUTH` through either. SRP, custom authentication and device tracking are outside the
  simulation, and an `AuthFlow` naming one of them is refused, never run as a flow that is.
  `GetTokensFromRefreshToken` runs beside them and is not a flow, as it is not one on real Cognito.
- `NEW_PASSWORD_REQUIRED`, `SMS_MFA`, `SOFTWARE_TOKEN_MFA`, `SELECT_CHALLENGE`, `PASSWORD` and
  `WEB_AUTHN` are the challenges issued, so `MFA_SETUP`, `SELECT_MFA_TYPE` and the custom
  authentication challenges cannot be reached. A `ChallengeName` this simulation never issues is
  refused, never answered as one it does.
- `EMAIL_OTP` and `SMS_OTP` are named in a `USER_AUTH` sign-in's `AvailableChallenges` where the
  pool's policy allows them, and choosing one is refused. Nothing here delivers a message, and the
  pool's own `EmailConfiguration` and `SmsConfiguration` are refused for the same reason.
- `PASSWORD_SRP` is absent from `AvailableChallenges`, where real Cognito names it beside `PASSWORD`
  for a pool allowing the `PASSWORD` factor. SRP is outside the simulation.
- A passkey completes a sign-in without a second factor being asked for, because real Cognito counts
  one as having met the pool's MFA requirement. Whether it does so for a pool configured `ON` with a
  `userVerification` of `preferred` was not checked against a live account.
- A passkey's `attestationObject` is stored by nobody and parsed by nothing. The public key is read
  from `response.publicKey`, where a browser's own JSON serialization puts it, and the credential is
  named after the relying party because the authenticator model real Cognito names it after lives in
  the attestation. `ES256` is the only algorithm accepted, and a key of another kind is refused with
  `WebAuthnCredentialNotSupportedException` whatever the credential labels it.
- `ListWebAuthnCredentials` reads a `MaxResults` of zero as the whole page. Cognito documents zero
  as the minimum for this listing and says nothing about what it answers with, and what a real pool
  does with it was not checked against a live account.
- The private half of a passkey lives in the simulator, because a test has no authenticator to hold
  it. `SimCognitoUserPool.webAuthnCredential` is what reads a credential out of it, and it is a
  deliberate divergence rather than an operation to write application code against. The signatures
  are real, and a credential built from another key is refused.
- `RevokeToken` is unimplemented. A refresh token is revoked by signing the user out, or by the
  rotation that replaces it.
- `GetTokensFromRefreshToken` refuses a `DeviceKey`, because device remembering is unsimulated, and
  passes a `ClientMetadata` to the pool's `PreTokenGeneration` trigger. `REFRESH_TOKEN_AUTH` passes
  none, as real `InitiateAuth` passes none.
- `REFRESH_TOKEN_AUTH` against a rotating app client is refused as an `InvalidParameterException`
  naming `GetTokensFromRefreshToken`. Real Cognito was not checked for the exception it raises
  there, and `aws-cdk-lib` keeps the combination from arising by dropping
  `ALLOW_REFRESH_TOKEN_AUTH` from a rotating client.
- Signing out revokes the user's tokens inside the simulation, and a token already handed to a
  verifier goes on verifying against the pool's JWKS until it expires. Verification happens in the
  caller's own verifier, which asks this simulation nothing and cannot be told the token was
  revoked. Real Cognito is the same for a verifier reading only the JWKS.
- The `cognito:preferred_role` and `cognito:roles` claims are absent from the tokens. A group's
  `RoleArn` is stored and reported, and nothing assumes that role. A `PreTokenGeneration` handler
  naming either claim is refused, never half-applied.
- A pool publishes one signing key where real Cognito publishes two and rotates between them, so
  code assuming a single JWKS entry passes here and is still wrong against real AWS. The key is
  generated with `node:crypto` the first time the pool signs or publishes one, and kept in memory
  for the life of the simulation.
- A password is kept so a user can sign in with it, and no operation reads one back.
- Users are resolved by username only. Real Cognito also accepts a user's `sub` where an admin
  operation asks for a username, and that fails here with `UserNotFoundException`.
- A pool reports the confirmation code a signed-up user is waiting to answer with, through
  `confirmationCode` on the pool object. Real Cognito sends the code and never reports it to anyone.
  Nothing here delivers a message, and this is what makes a registration flow testable. It is a
  deliberate divergence rather than an operation to write application code against.
- A confirmation code never expires, where a real one lasts 24 hours. `ResendConfirmationCode` is
  what replaces one.
- `AdminConfirmSignUp` verifies nothing, whatever the pool's `AutoVerifiedAttributes` say, as it
  verifies nothing on real Cognito. `ConfirmSignUp` sets `email_verified` and
  `phone_number_verified`, and only where the user has the attribute to verify, and a `PreSignUp`
  trigger sets them by asking for `autoVerifyEmail` or `autoVerifyPhone`.
- `AutoVerifiedAttributes` is accepted at `email` and `phone_number`, and anything else is refused.
  Those are the two Cognito can send a code to.
- `ConfirmSignUp` and `ResendConfirmationCode` report a user the pool lacks whatever the app
  client's `PreventUserExistenceErrors` says. The sign-ins and the two password reset operations
  honour the setting.
- A reset code never expires either, where a real one lasts an hour. A second `ForgotPassword`
  replaces it, and answering with it spends it. A spent code is refused with `ExpiredCodeException`.
  That is what real Cognito calls a code it will no longer take.
- `ForgotPassword` sends its code to an attribute the pool verifies automatically, and refuses a
  user the pool can reach at neither `email` nor `phone_number`. Real Cognito chooses by the pool's
  `AccountRecoverySetting`, which is recorded here and read by nothing, so a pool that recovers by
  email alone behaves here exactly as one that recovers by phone number would.
- The destination `ForgotPassword` reports is masked in real Cognito's shape rather than in a shape
  read back from a live account. Assert that a destination came back and which medium carried it.
- `ChangePassword` is unimplemented. It is the signed-in user replacing a password it still knows,
  and it belongs to a different flow.
- Unsimulated sign-up inputs are refused rather than ignored: `AnalyticsMetadata` and
  `UserContextData` on the three client-side operations and on the two password reset ones, and
  `ForceAliasCreation` and `Session` on `ConfirmSignUp`. `ClientMetadata` is absent from that list,
  because each reaches a trigger that runs here.
- No message is ever delivered. A pool records what it would have sent and `sentMessages` reads it
  back, which real Cognito reports to nobody. Nothing leaves the simulation, and no
  `CodeDeliveryDetails` is reported by `SignUp` or `ResendConfirmationCode`. `ForgotPassword`
  reports one, as real Cognito does.
- A message is recorded on five occasions, being `SignUp`, `ResendConfirmationCode`,
  `AdminCreateUser`, `Authentication` (an MFA code sent by text message) and `ForgotPassword`, which
  covers the reset an administrator starts as well as the one the user asks for. Attribute
  verification and the account-taken-over notices are occasions real Cognito sends on and this
  simulation never reaches.
- A verification message is recorded only for an attribute the pool verifies automatically. A pool
  with no `AutoVerifiedAttributes` records none, and only for a user that has to confirm. One a
  `PreSignUp` handler auto-confirmed is sent nothing, as on real Cognito. An invitation is recorded
  whatever the pool verifies, and both are recorded only where the user has an `email` or a
  `phone_number` to be reached at.
- `DesiredDeliveryMediums` is refused. The medium comes from the attribute the message is written
  to. A request naming `SMS` for a user with an email address would be recorded as an email. Real
  Cognito defaults `AdminCreateUser` to `SMS`, and this records an email where the user has an
  address.
- An invitation for a user created with no `TemporaryPassword` keeps the `{####}` placeholder,
  because real Cognito generates a password there and this simulation leaves the user with none at
  all.
- `EmailConfiguration` and `SmsConfiguration` stay refused. A pool configured to send through SES or
  an SNS SMS role would still only record here, and accepting the configuration would say the
  messages went that way. The record is Cognito's own, what the default `EmailSendingAccount` of
  `COGNITO_DEFAULT` sends by, and there is no simulated SES.
- Confirming a sign-up by following a link is outside the simulation. A
  `VerificationMessageTemplate` with `DefaultEmailOption: CONFIRM_WITH_LINK`, an
  `EmailMessageByLink` or an `EmailSubjectByLink` is refused, and a `CustomMessage` event carries no
  `linkParameter`.
- `VerificationMessageTemplate` wins over `EmailVerificationMessage`, `EmailVerificationSubject` and
  `SmsVerificationMessage` where a request sets both, and each of those fills in what the template
  left out. What real Cognito does when the two disagree was not checked against a live account.
- Verification wording with no `{####}` in it is refused, as it is on real Cognito, because the
  message would reach a user with no code in it. So is wording outside the lengths Cognito takes: 6
  to 20,000 characters for an email, and 6 to 140 for a text message. The subject goes unchecked
  against its own length.
- The default wording, for a pool that set none, is taken from the Cognito API documentation rather
  than read back from a live account.
- The recorded messages are listed over HTTP at `GET /<userPoolId>/messages`, an endpoint real
  Cognito lacks. It is the serving side of `sentMessages` and a divergence for the same reason.
- The `CustomEmailSender` and `CustomSMSSender` triggers are refused. Real Cognito hands those the
  code as an AWS Encryption SDK ciphertext to decrypt through KMS, that envelope is outside the
  simulation anywhere here, and a version handing over a plain code would give a handler that cannot
  decrypt anything on real AWS.
- A temporary password never expires. `TemporaryPasswordValidityDays` is stored on the pool and
  acted on nowhere.
- Unsimulated `AdminCreateUser` inputs are refused, never ignored: `DesiredDeliveryMediums`,
  `ForceAliasCreation`, and a `MessageAction` of `RESEND`, which invites a user that already exists.
  Its `ValidationData` and `ClientMetadata` are read, and reach the `PreSignUp` and `CustomMessage`
  triggers. `AdminUpdateUserAttributes` refuses `ClientMetadata`, because the message an attribute
  update would have sent is one this simulation never sends.
- `ListUsers` refuses `Filter` and `AttributesToGet` outright, and lists users in creation order.
  Real Cognito chooses its own order and promises none.
- `ListUsers`, `ListGroups`, `AdminListGroupsForUser` and `ListUsersInGroup` refuse a `Limit` of
  zero, which the real operations accept without saying what they return. Refusing it is better than
  guessing between an empty page and a full one.
- Real Cognito leaves the order `AdminListGroupsForUser` returns groups in undocumented. Here it is
  by precedence, because that is the order the `cognito:groups` claim uses, and it is what a test
  reading the first group is usually after.
- `UpdateGroup` replaces all three group properties rather than merging, and an omitted one is
  cleared. Real Cognito says which it does nowhere.
- A group's `RoleArn` is stored and reported, and no code assumes that role. It reaches the
  `cognito:roles` and `cognito:preferred_role` claims, which are outside the simulation yet, and
  identity pools, which are outside the simulation at all.
- Group to IAM role mapping is an identity pool feature and is outside the simulation.
- A pool holds the standard user attributes and the ones its `Schema` declared, and an attribute no
  schema declares is refused, as is a request setting `sub`. A `DeveloperOnlyAttribute` is refused,
  because a `dev:` attribute needs the developer credentials that read and write it.
  `AdminDeleteUserAttributes` is unimplemented, so an attribute can be changed and never removed. An
  app client's `ReadAttributes` and `WriteAttributes` are refused, so every client of a pool sees
  and sets every attribute the pool holds.
- `EstimatedNumberOfUsers` is how many users the pool holds now. Real Cognito refreshes that number
  periodically rather than on each write, and it can lag there in a way it never does here.
- A sign-in by a user of an `ON` pool that has registered no factor is refused, because real Cognito
  answers that one with the `MFA_SETUP` challenge, which registers a factor mid-sign-in and is
  outside the simulation. A user with both factors enabled and neither preferred is refused for the
  same kind of reason. Real Cognito answers that with `SELECT_MFA_TYPE`.
- An MFA code is texted to the user's `phone_number` whatever the pool's `AutoVerifiedAttributes`
  say, and the pool records it as a message with an occasion of `Authentication`, where a test reads
  it from. Real Cognito delivers it and reports it to nobody.
- A `SOFTWARE_TOKEN_MFA` challenge carries no `FRIENDLY_DEVICE_NAME` in its `ChallengeParameters`,
  because no device is remembered here.
- A user's software token secret is a real RFC 6238 shared secret, and the pool reports the code the
  user's authenticator app would be showing through `SimCognitoUserPool.softwareTokenCode`. Real
  Cognito reports that to nobody, because the code is on the user's own device, in the way a
  confirmation code is in the user's own inbox.
- `VerifySoftwareToken` registers a token and enables nothing, so `SetUserMFAPreference` is what
  turns a factor on. Whether real Cognito also activates a TOTP factor on verification alone was not
  checked against a live account.
- A `SetUserMFAPreference` request leaves a factor it says nothing about as it was. Real Cognito
  documents neither replacing nor merging there, and a request naming both factors behaves the same
  either way.
- `AdminGetUser` reports no `MFAOptions`. That field is the deprecated way of reporting an SMS
  factor, and `UserMFASettingList` and `PreferredMfaSetting` are what report one here.
- `SetUserPoolMfaConfig` accepts `SoftwareTokenMfaConfiguration` and `SmsMfaConfiguration`. The
  `SmsConfiguration` inside the latter is refused, in the same words `CreateUserPool` refuses the
  pool's own. No message is delivered here, and the IAM role Cognito would assume to send one is
  never assumed. `EmailMfaConfiguration` is refused because a pool here has no `EmailConfiguration`
  to send that message with. A `WebAuthnConfiguration` is reported back by `GetUserPoolMfaConfig`
  and read by `StartWebAuthnRegistration`, which registers a passkey against the relying party it
  names.
- `AssociateSoftwareToken` and `VerifySoftwareToken` take an `AccessToken` and refuse a `Session`,
  because the `MFA_SETUP` challenge that would issue one is outside the simulation. A
  `FriendlyDeviceName` is refused for the same kind of reason. Device tracking is outside the
  simulation.
- `UpdateUserPool` replaces a pool's settings rather than merging into them, as real Cognito does. A
  setting the request leaves out goes back to the default `CreateUserPool` would have given it. It
  covers the settings this simulation models: `Policies.PasswordPolicy`, `DeletionProtection`,
  `AdminCreateUserConfig.AllowAdminCreateUserOnly`, `AutoVerifiedAttributes`, `LambdaConfig`,
  `MfaConfiguration` and the verification wording. An update carries no factor configuration, and
  the factors a `SetUserPoolMfaConfig` request set are left alone, as real Cognito leaves them.
  `PoolName` is refused, leaving a pool unrenameable, a `Schema` is refused because real
  `UpdateUserPool` has no such input, and every input `CreateUserPool` refuses is refused here too,
  in the same words.
- `UpdateUserPoolClient` replaces an app client's settings the same way. A setting the request
  leaves out goes back to the default `CreateUserPoolClient` would have given it. `ClientName` is
  the exception. A client has to have a name and there is no default to reset to, so an update that
  names none keeps the one the client has.
- An update leaves the client's secret alone. `UpdateUserPoolClient` has no `GenerateSecret` input
  on real Cognito, and a client created without a secret never gains one.
- A redeployed template reaches neither update. Sim CloudFormation replaces a resource whose
  resolved template entry changed rather than updating it in place, whatever the resource type.
- `PreSignUp`, `PostConfirmation`, `PreAuthentication`, `PostAuthentication`, `PreTokenGeneration`
  and `CustomMessage` are the only Lambda triggers that run. Every other `LambdaConfig` key is
  refused when the pool is created or updated, naming the trigger, because a pool that accepted one
  would never call the function the template named. The custom challenge triggers would need a
  challenge loop this simulation lacks, and the migration and federation triggers have no external
  directory to reach. A simulated identity provider answers with the user `signInAs` put there,
  beyond the reach of a trigger.
- `AdminCreateUser` leaves `PostConfirmation` unfired, here and on real Cognito. It is the tempting
  place to hang the trigger and the wrong one. A project relying on it would pass here and write no
  record in production.
- `PostConfirmation` reports two sources, being `PostConfirmation_ConfirmSignUp` and
  `PostConfirmation_ConfirmForgotPassword`. A handler that hangs a profile record off the first
  confirmation sees the second one too.
- A `PreSignUp` handler asking to verify an attribute the sign-up did not carry refuses the sign-up
  with `InvalidParameterException`. Real Cognito refuses it too, and what it names the error has not
  been checked against a live account.
- `PreSignUp_ExternalProvider` goes unreached too. A federated sign-in creates the pool's user
  directly rather than through the sign-up path a trigger hangs off.
- A `PostConfirmation` or `PostAuthentication` handler that throws fails the request, and what it
  ran after stands. A confirmed user stays confirmed and the tokens a pool issued stay issued, as
  they do on real Cognito.
- Neither sign-in trigger fires for `REFRESH_TOKEN_AUTH`, as neither does on real Cognito.
  `PreTokenGeneration` does fire there, because the pool is issuing tokens.
- `PreTokenGenerationConfig` is refused, and the trigger runs at `V1_0` alone. The `V2_0` and `V3_0`
  events customise access token claims and carry `scopesToAdd` and `scopesToSuppress`, none of which
  is simulated. The one change a `V1_0` event makes to an access token, replacing its
  `cognito:groups`, is applied.
- A `V1_0` claim value is a string, and a handler returning anything else is refused. The complex
  claim values arrived with the `V2_0` event.
- `claimsToAddOrOverride` and `claimsToSuppress` reach the id token alone, because a `V1_0` event
  customises that token. `cognito:groups` on an access token is changed through
  `groupOverrideDetails`, what real Cognito calls the only change a `V1_0` event makes to an access
  token. `claimsToSuppress` naming a `cognito:` claim other than `cognito:groups` is refused, since
  real Cognito suppresses none of the others.
- A `PreTokenGeneration` response naming a claim real Cognito reserves is refused, where real
  Cognito ignores one. That is a deliberate divergence. A claim that silently goes missing in
  production is the failure a test with a trigger in it is there to catch.
- `groupOverrideDetails.iamRolesToOverride` and `preferredRole` are refused, and the request's
  `groupConfiguration` carries neither, because the `cognito:roles` and `cognito:preferred_role`
  claims they feed go unissued here. A handler copying the request's `groupConfiguration` back into
  its response, the way real Cognito says to leave the groups alone, works unchanged.
- `ClientMetadata` reaches `PreTokenGeneration` from `RespondToAuthChallenge` and
  `AdminRespondToAuthChallenge` alone, as it does on real Cognito. A refresh accepts one and it
  reaches nothing.
- A `CustomMessage` event reports `CLIENT_ID_NOT_APPLICABLE` as its `callerContext.clientId` for an
  `AdminCreateUser` and an `AdminResetUserPassword`, as real Cognito does for an admin operation,
  and names the app client for the occasions that come through one.
- Unsimulated `CreateUserPool` inputs are refused, never ignored: `AliasAttributes`,
  `UsernameConfiguration`, `UserAttributeUpdateSettings`, `DeviceConfiguration`, `UserPoolAddOns`,
  `KeyConfiguration`, `IssuerConfiguration`, `UserPoolTags`, the email and SMS configurations, an
  `SmsAuthenticationMessage`, a `UserPoolTier` other than `ESSENTIALS`, and a
  `PasswordHistorySize`.
- `Policies.SignInPolicy` is recorded and reported back by `DescribeUserPool`. The four factor names
  Cognito accepts are `PASSWORD`, `EMAIL_OTP`, `SMS_OTP` and `WEB_AUTHN`, a list names five at most,
  and a policy offering `WEB_AUTHN` and nothing else is refused however many times it repeats the
  name, as AWS states it must be accompanied by at least one other option. A `USER_AUTH` sign-in
  reads the policy to decide what to offer, and `PASSWORD` and `WEB_AUTHN` are the two factors this
  simulation presents.
- `WebAuthnRelyingPartyID` and `WebAuthnUserVerification` deploy from an `AWS::Cognito::UserPool`
  Resource. Real CloudFormation configures both in a `SetUserPoolMfaConfig` call once the pool
  exists, and this deploys them the same way, so a stack declaring passkeys needs
  `cognito-idp:SetUserPoolMfaConfig` as well as `cognito-idp:CreateUserPool`. A relying party ID is
  a domain of between one and 127 characters, and one outside that is refused.
- `AccountRecoverySetting` is recorded and reported back by `DescribeUserPool`, and no code reads
  it. Any mechanisms Cognito has are accepted, in any order, and a setting outside the shape Cognito
  states is refused. `ForgotPassword` picks its destination from the pool's `AutoVerifiedAttributes`
  (`email` before `phone_number`), so a pool that recovers by email alone behaves here exactly as
  one that recovers by phone number would.
- `AdminCreateUserConfig.AllowAdminCreateUserOnly` is acted on, and the two keys beside it are
  refused. `InviteMessageTemplate` is the wording of the invitation, and a pool cannot set its own
  yet, leaving an invitation recorded at Cognito's default wording. `UnusedAccountValidityDays`
  expires a temporary password, and no code here expires one.
- `UsernameAttributes` is simulated, and `AliasAttributes` is outside it. The two differ in what the
  username is. A `UsernameAttributes` pool generates one, and that is what this stores. An
  `AliasAttributes` pool keeps the username the request chose and takes the attribute as a second
  way of naming the user, and that is unmodelled.
- A `UsernameAttributes` pool resolves the address for its admin operations and its sign-ins, and
  refuses a second user holding an address another user already signs in by.
- Unsimulated `CreateUserPoolClient` inputs are refused the same way. They are a `ClientSecret` of
  your own, `AnalyticsConfiguration`, `EnablePropagateAdditionalUserContextData`, `ReadAttributes`,
  `WriteAttributes`, and an `EnableTokenRevocation` of `false`. `UpdateUserPoolClient` refuses the
  same inputs, in the same words.
- The OAuth settings need `AllowedOAuthFlowsUserPoolClient` to be true before they can be set, as
  they do on real Cognito. `AllowedOAuthFlows` takes `code` alone: `implicit` hands tokens to the
  browser, and `client_credentials` needs the resource servers that define its scopes, so both are
  refused. `AllowedOAuthScopes` takes the system scopes, and a custom scope is refused for the same
  reason.
- Unsimulated authentication inputs are refused the same way. They are `AnalyticsMetadata` on all
  four operations, `ContextData` on the admin ones, `UserContextData` on the client ones, and a
  `Session` on `InitiateAuth` or `AdminInitiateAuth`. A challenge this simulation issued is answered
  through `RespondToAuthChallenge` or `AdminRespondToAuthChallenge` rather than by starting a fresh
  sign-in that carries the session.
- A pool's schema is settled when the pool is created. `AddCustomAttributes` is unimplemented, and
  an `UpdateUserPool` request carrying a `Schema` is refused, because real `UpdateUserPool` has no
  such input.
- The managed login pages approximate what real managed login looks like and go no closer. Their
  stylesheet is a few dozen lines held inline, where real managed login is built on Cloudscape.
  There is no script on them, and `AWS::Cognito::ManagedLoginBranding` is an unsupported resource
  type. They are also at paths of this simulation's own. Real managed login serves its sign-in form
  at `/login` and confirms a sign-up within `/signup`, where here the authorize endpoint answers
  with the form itself and `/confirm` is a page. `/oauth2/userInfo`, `/oauth2/revoke`,
  `/oauth2/idpresponse` and the SAML endpoints go unserved.
- The pages carry the authorize parameters in hidden inputs, where real managed login carries them
  in a `page-data` cookie. The `cognito` session cookie is set and read, and the `XSRF-TOKEN`,
  `csrf-state`, `lang` and `page-data` cookies real managed login also sets go unset.
- A hosted sign-in that real managed login would answer with a further page is refused. That is a
  user which has registered a second factor, and a user holding a temporary password. Both
  challenges are simulated at `InitiateAuth` and `AdminInitiateAuth`, which is where a test drives
  them. A user in `RESET_REQUIRED` is refused there as well, where real managed login prompts for a
  new password at sign-in. The served reset pages are the ones a person reaches from the sign-in
  form, and they start a reset rather than finishing one an administrator forced.
- The implicit grant is refused, and so is the client credentials grant, which needs resource
  servers.
- A web ACL in front of a pool sees the endpoints this simulation serves and no others. The
  user-interactive endpoints real Cognito also has at `/login`, `/resendcode`, `/confirmUser` and
  `/passkeys/add` are unserved here, so a rule written for one of them is never reached. The
  `/<pool-id>/messages` listing is outside the web ACL, because real Cognito serves nothing there.
- The public user pool API operations reached over the SDK, `SignUp` and `InitiateAuth` among them,
  are evaluated against no web ACL. Real WAF inspects them, including their bodies. They arrive here
  as SDK Commands and carry no HTTP request for a rule to read.
- The served OpenID configuration names its `authorization_endpoint`, `token_endpoint` and
  `end_session_endpoint` once the pool has a domain, at that domain's local hostname. It carries no
  `userinfo_endpoint`, where real Cognito names one.
- Nothing calls an external identity provider. A provider's `ProviderDetails` are recorded and
  validated for presence, and never used. The user a simulated provider signs in is the one
  `signInAs` put there. That accessor is a divergence for the same reason `confirmationCode` is one.
- A custom domain answers on its own hostname with no Route53 record of its own, where real AWS
  needs an alias record to the CloudFront distribution Cognito creates. The distribution name a
  domain reports is a name unserved here.
- `/logout` ends the browser's managed login session and redirects. It signs nobody out at the
  identity provider, which real Cognito also leaves undone, so a user signed out here is still
  signed in at Google.
- A managed login session is reused for any authorize request that names no identity provider and
  carries no credentials. Real Cognito records which method started the session, and a request
  naming a provider here signs in at that provider afresh whatever the browser is holding. `prompt`
  goes unread, so there is no way to ask for a sign-in the session cannot answer.
- A pool creates no group for each identity provider, where real Cognito creates one named
  `<userPoolId>_<ProviderName>` and puts each federated user in it. A `cognito:groups` claim here
  therefore names only the groups something added the user to.
- A federated sign-in is refused with `UsernameExistsException` where the username it would take is
  already a user of the pool's own. A username may hold an underscore, so `Google_1234` can be a
  local user, and signing in as it would hand the application someone else's account.
- `AdminLinkProviderForUser` is unimplemented, and a federated user is never linked to a user that
  was already in the pool, and the `identities` it carries always names one provider.
- The `PreAuthentication`, `PostAuthentication` and migrate user triggers do not fire on a sign-in
  at the hosted domain, federated or local. `PreTokenGeneration` does, at the token endpoint where
  the claims are settled.
- A domain reports no `S3Bucket` or `Version`, both of which name parts of the machinery real
  Cognito builds a domain out of. Its `Status` is `ACTIVE` as soon as it exists, where a real prefix
  domain takes a minute and a custom domain up to an hour.
- A custom domain's `CertificateArn` is required and recorded, and goes unresolved against simulated
  ACM. Nothing here terminates TLS.
- A `SupportedIdentityProviders` naming a provider the pool lacks is accepted, and the authorize
  request naming that provider is what refuses. Real Cognito checks the provider exists when the app
  client is written.
- The served `issuer` and `jwks_uri` name the localhost origin the request arrived on, letting a
  client fetch the keys they point at. A token's `iss` claim still names the real
  `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`. The two disagree here and agree on real
  Cognito.
- Resource servers and risk configuration are outside the simulation.
- Tags are outside the simulation. `UserPoolTags` is refused, and `TagResource`, `UntagResource` and
  `ListTagsForResource` are unimplemented.
- Listings carry no filtering, and are in creation order rather than any order real Cognito chooses.
- Of the CloudFormation resource types, `AWS::Cognito::UserPool`, `AWS::Cognito::UserPoolClient`,
  `AWS::Cognito::UserPoolGroup`, `AWS::Cognito::UserPoolDomain` and
  `AWS::Cognito::UserPoolIdentityProvider` deploy. The others, including
  `AWS::Cognito::UserPoolResourceServer`, `AWS::Cognito::UserPoolUser` and everything under
  `AWS::Cognito::IdentityPool`, are reported as unsupported and skipped, never deployed.
- The Cognito API itself is not served as HTTP by `serveSimAws`, only the two public pool endpoints.
  A `CognitoIdentityProviderClient` reaches the simulator through `SimSdk` rather than through an
  endpoint override.
- Cognito identity pools are a different service and nothing about them is simulated.
