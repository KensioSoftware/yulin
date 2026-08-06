# Simulated Cognito user pools implementation

This directory contains the simulated Cognito user pools implementation. Cognito identity pools,
which exchange a token for AWS credentials, are a separate service and are not simulated at all.

The pool, the app client, the users and groups in it, self-service sign-up, the sign-in flows on
both sides of the API, the messages it would have sent, the tokens it issues and the authorizer are
all here. SRP, the hosted UI, MFA, password resets and device tracking are not.

## Entry points

- `sim-cognito-identity-provider.ts` is the main in-memory service object for one account/region
  scope. It holds the pool and app client operations, and extends
  `sim-cognito-user-directory.ts`, which holds the user and group ones and extends
  `sim-cognito-authentication.ts`, which holds signing in and signing out. A caller sees one service
  object, as the real API is one service; the split is because a pool's settings, a pool's contents
  and authenticating against it are three concerns, and one class holding all of them had outgrown
  reading in one sitting.
- `index.ts` exports the public Cognito simulator API for `@kensio/yulin/cognito`.

A `SimCognitoIdentityProvider` instance owns a `SimCognitoUserPoolStore` holding its pools. The
simulator is scoped to an account and region because real pools are: a pool id names its region, and
a pool in one region cannot be reached from another.

## Pool and app client model

Pool state lives under `user-pool/`, and app client state under `user-pool/client/`.

`SimCognitoUserPool` is the stored resource: its id, its ARN, its settings, and its app clients. The
pool owns the clients rather than a separate store owning them, because that is where they live on
real Cognito: deleting a pool takes its clients with it, and a client id means nothing outside the
pool that issued it.

`SimCognitoUserPoolSettings` holds the settings a request can change: the password policy, the
deletion protection, whether users may sign themselves up, what confirming a sign-up verifies, the
Lambda triggers the pool runs, and what its messages say. `CreateUserPool` and `UpdateUserPool` both
build one out of their own request, and an update swaps the pool's for it. That is what makes an
update replace rather than merge, and it is where the pool's `LastModifiedDate` moves. Each takes the
operation name, so a refusal from inside the settings names the request it came from.

`makeSimCognitoUserPoolId` builds the `<region>_<nine characters>` form. The region is part of the id
rather than decoration: SDK code splits a pool id on the underscore to work out which region to talk
to, and the token issuer URL is built from it the same way.

`SimCognitoUserPoolArn` is the ARN, which is the pool id after `userpool/`. It is the resource every
Cognito IAM policy is written against, app client operations included, because an app client has no
ARN of its own.

`SimCognitoPasswordPolicy` applies the defaults real Cognito applies when a request says nothing:
eight characters, with an uppercase letter, a lowercase letter, a number and a symbol each required.
`SimCognitoPasswordCheck` is what applies it to a password. The two are separate because the policy
is part of the pool's state and the checking is not, and because both `AdminCreateUser` and
`AdminSetUserPassword` need the same check.

`SimCognitoExplicitAuthFlows` validates the authentication flows an app client supports. The values
are checked rather than stored as written, because a typo in a flow name would otherwise turn into a
puzzling sign-in failure much later, and the legacy and `ALLOW_` prefixed flows cannot be mixed, as
real Cognito refuses to mix them.

`SimCognitoPreventUserExistenceErrors` is the setting that decides whether a sign-in naming an
unknown user says so or is refused the way a wrong password is. It is honoured rather than picked,
because a test asserting the generic refusal against a client that actually leaks user existence is
asserting the wrong thing. The API default is `LEGACY`, which leaks it, and the console applies
`ENABLED` to a client made there.

`SimCognitoTokenValidity` and `SimCognitoTokenLifetime` resolve the three token lifetimes. A validity
is a number in a unit, and the two arrive in separate request inputs, so the same `1` means an hour
for an access token and a day for a refresh token. Resolving both into seconds in one place is what
stops the pairing being got wrong when tokens are actually issued.

`SimCognitoUserPoolClientSettings` holds the properties a request can set: the name, the
authentication flows, `PreventUserExistenceErrors`, the token validities, and the two managed login
settings that are reported back without being acted on. `CreateUserPoolClient` builds one from its
request and `UpdateUserPoolClient` builds a fresh one and replaces what the client had, so a setting
an update leaves out goes back to the default a create would have given it. That is what real
Cognito does. `ClientName` is the exception the command applies: a client has to have a name and
`CreateUserPoolClient` requires one, so there is no default to reset to and an update naming none
keeps the name the client has.

`makeSimCognitoClientSecret` generates a client secret, and only a client created with
`GenerateSecret` gets one. A public client has no secret at all rather than an empty one, which is
what makes code computing a `SECRET_HASH` fail on the client it should fail on. The secret is not
one of the settings, so an update leaves it alone, as real Cognito does with no `GenerateSecret`
input on `UpdateUserPoolClient`.

## User model

User state lives under `user-pool/user/`, and the pool owns its users for the same reason it owns
its app clients: deleting a pool takes them with it, and a username means nothing outside the pool
holding it.

`SimCognitoUser` is the stored user: its username, its `sub`, its attributes, its status, whether it
is enabled and the password it signs in with. The `sub` is a fresh UUID rather than anything derived
from the username, because that is the difference most code gets wrong. The password is checked
against the pool's policy when it is set, and held as a `SimCognitoUserPassword` that answers
whether a candidate matches and exposes nothing, the same modelling choice simulated KMS key
material makes.

`SimCognitoUserStatus` holds the three statuses this simulation can reach, and the transitions
between them. `AdminCreateUser` leaves a user in `FORCE_CHANGE_PASSWORD`, and only a permanent
password reaches `CONFIRMED`. `SignUp` leaves a user in `UNCONFIRMED`, and `ConfirmSignUp`,
`AdminConfirmSignUp` or a permanent password reaches `CONFIRMED` from there. The rest of the real
statuses belong to password resets and federation, neither of which is simulated.

`SimCognitoConfirmationCode` is the six-digit code a signed-up user is issued. A user gets one when
it is constructed `UNCONFIRMED`, spends it when it leaves that status, and `ResendConfirmationCode`
replaces it with another rather than sending the same one again. The code is readable, through
`SimCognitoUserPool.confirmationCode`, which real Cognito never allows: nothing here delivers a
message, so a test would otherwise have nowhere to read it from. That accessor is the one place this
simulation knowingly tells a caller something real Cognito would not.

`SimCognitoAdminCreateUserConfig` is whether users may sign themselves up, and
`SimCognitoAutoVerifiedAttributes` is what confirming a sign-up marks verified. Both are pool state
rather than settings accepted and ignored: `AllowAdminCreateUserOnly: true` is what a CDK `UserPool`
without `selfSignUpEnabled` emits, and a simulation that took `SignUp` against such a pool would
pass code that a deployment refuses.

`SimCognitoUserAttributes` validates attribute names against the pool's schema. Only the standard
attributes exist, because `CreateUserPool` refuses a `Schema`, so a `custom:` attribute is refused
here as it would be on a real pool created the same way. `sub` is refused too, and lives on the user
rather than among its attributes, because Cognito allocates it and a request cannot set it.

`SimCognitoUserStore` keys users by username. Its refusal for a username that reaches nothing says
so when the value given is some user's `sub`, because real Cognito accepts a `sub` there and this
simulation does not.

`SimCognitoIdentifier` is the form a username and a group name share: required, at most 128
characters, and no whitespace. Cognito gives both the same rule, so it lives in one place and
`requireSimCognitoUsername` and `requireSimCognitoGroupName` each name their own field in the
refusal.

## Message model

Message state lives under `user-pool/message/`, and the pool owns the messages it would have sent
the way it owns its users.

`SimCognitoSentMessage` is one recorded message: who it was for, where it would have gone, by which
medium, what it said and what the pool was doing when it sent it. `SimCognitoSentMessageStore` holds
them in order, and `SimCognitoUserPool.sentMessages` is where a test reads them. Nothing is
delivered, so this record is the whole of what a message is here. It is Cognito's own delivery
rather than a simulated SES: real Cognito with the default `EmailSendingAccount` of
`COGNITO_DEFAULT` sends through no other service, and `EmailConfiguration` is refused, so no pool is
configured for a delivery this would misrepresent.

`SimCognitoPoolMessenger` is what the sign-up and user commands ask to send. It resolves where the
message goes, runs the pool's `CustomMessage` trigger, and records what is left. The steps are
separate collaborators because each is a different question: `SimCognitoMessageDelivery` is where
and by what medium, `simCognitoOccasionWording` is what the pool says, `SimCognitoCustomMessage` is
what a handler said instead, and `SimCognitoMessagePlaceholders` fills in the code and the username
last, so that what a handler wrote carries them too.

`SimCognitoVerificationMessages` is the wording a pool was created with. It is a pool setting rather
than a value accepted and reported, because the recorded message is what it says.
`VerificationMessageTemplate` wins over the three older inputs, each of which fills in what the
template left out. Confirming by link is refused in
`SimCognitoUnsimulatedUserPoolMessaging` instead, so what reaches the settings is always wording for
a code.

`SimCognitoMessageOccasion` is the three occasions a message is sent on, and it is what a
`CustomMessage` `triggerSource` is built from. It is a leaf module so that both the trigger and the
message sides can name an occasion without depending on each other.

## Group model

Group state lives under `user-pool/group/`, and the pool owns its groups the way it owns its users.

`SimCognitoGroup` holds the group's properties and its members. Membership lives on the group rather
than on the user because that is the direction deletion runs: deleting a group takes the membership
with it and leaves the users alone. Deleting a user is the other way round, so `SimCognitoUserPool`
sweeps the group store when a user goes, and no group is left holding a member the pool cannot
describe.

`SimCognitoGroupSettings` validates the three properties a request can set: the description, the
precedence and the role ARN. `UpdateGroup` builds a fresh one and replaces what the group had, so an
omitted property is cleared. Real Cognito does not document whether it replaces or merges, and a
request naming every property behaves the same either way, which is what the refusal to guess pushes
callers towards.

`SimCognitoGroupStore.forUser` is where precedence ordering happens: lowest value first, groups with
no precedence last, and groups sharing one in creation order. That is the order the `cognito:groups`
claim uses, so `AdminListGroupsForUser` reads the same way the claim does.

## Token model

Token state lives under `user-pool/token/`.

`SimCognitoSigningKey` holds a real RSA key pair generated with `node:crypto`, and signs real RS256
JWTs. Each pool has its own, as each real pool does, so a token from one pool carries a signature
another pool's JWKS cannot verify. A pool generates its key the first time it signs or publishes
one, rather than when it is created, because 2048-bit generation takes long enough to notice and
most pools in a suite never sign anything. Nothing is written to disk and no key material is in the
repository.

`SimCognitoIdToken` and `SimCognitoAccessToken` build the claims of each token, and
`SimCognitoSharedTokenClaims` builds what both carry. They are separate because the difference
between them is the point: an id token has `aud`, `cognito:username` and the user's attributes, and
an access token has `client_id`, `username` and a `scope`. Code reading the wrong one for a claim
fails here the way it fails in production.

`SimCognitoTokenIssuer` ties them together and takes every timestamp from the injectable clock, so a
sign-in in the simulated past produces a token a verifier already considers expired. It also mints
the refresh token, which is an opaque string rather than a JWT, as it is on real Cognito. `issue`
hands out all three tokens and `reissue` signs a new access and id token for a refresh, which is the
difference `REFRESH_TOKEN_AUTH` answers with. Everything it issues is recorded on the pool, because
the pool is what a refresh or a sign-out presents a token back to.

The pool's `PreTokenGeneration` trigger runs from the issuer, because that is where a token's claims
are settled, and it runs from `reissue` as well as from `issue`: real Cognito fires it on a refresh
too, and a simulation that only fired it on a first sign-in would let a claim the handler has since
changed survive one. Each caller says which occasion it is issuing for, which is what becomes the
handler's `triggerSource`.

`SimCognitoClaimsOverrideReader` reads what the handler wrote into `response.claimsOverrideDetails`
and answers with a `SimCognitoClaimsOverride`, which is what applies the changes to a claim set. A
pool with no such trigger produces an empty override rather than nothing, so the issuer applies one
either way. `sim-cognito-reserved-claims.ts` holds the claims a handler may not name. Refusing those is a
deliberate divergence: real Cognito drops the override without saying so, and a handler that appears
to work here and does nothing deployed is the failure worth catching. The claim changes reach the id
token, and the group override reaches the access token as well, which is the one change a `V1_0`
event makes to one.

## CloudFormation resources

`cfn/` creates `AWS::Cognito::UserPool`, `AWS::Cognito::UserPoolClient` and
`AWS::Cognito::UserPoolGroup`, one creator per type behind
`SimCognitoCfnResourceFactory`. Each creator goes through the ordinary Command rather than
constructing the model, so a deployed pool is the same thing an SDK caller would have got, refusals
included.

A properties class per type turns the template's properties into that Command's input.
`UserPoolName` is the one property whose CloudFormation name differs from the API's `PoolName`.
`SimCfnCognitoPropertyParser` and the `SimCfnCognitoValueParser` it extends read the property
shapes, accepting the quoted forms CloudFormation carries numbers and booleans in.

Each type states the properties it simulates, and every other property is refused. That is an
allow-list rather than a list of known-unsimulated properties, because CloudFormation has properties
the Cognito API does not, `EnabledMfas` among them, and those would otherwise be dropped on the way
to a Command that has nowhere to refuse them. Properties the API does know, such as
`MfaConfiguration`, are passed through instead, so the refusal that reaches the reader is the one
that says why.

A property whose only accepted value is one particular value counts as simulated at this layer and
is judged by the Command that receives it, so the value is judged in one place rather than two.
`SimCognitoUnsimulatedInput` compares a string or a boolean, and `SimCognitoUnsimulatedStructure`
compares an object by its contents, through the canonical rendering in
`SimCognitoCanonicalValue`. What each Command accepts and why is in the doc comments on
`SimCognitoUnsimulatedUserPoolFeatures` and `SimCognitoUnsimulatedUserPoolMessaging`. The values
each pool and client was created with are kept in `SimCognitoUnsimulatedPoolSettings` and
`SimCognitoUnsimulatedClientSettings`, which exist only so a described resource reports back what
its request set.

`UserPoolName` and `ClientName` are both optional, and a CDK `UserPool` construct emits neither,
while both creation Commands require a name. `SimCfnCognitoGeneratedName` generates one from the
stack name and the logical ID. One class covers both because Cognito gives a pool and a client the
same name rules.

`Ref` and `Fn::GetAtt` live in `cloudformation/resource/cfn/cognito/`, one adapter per Resource
type, rather than on the service objects.

## Served pool endpoints

`serve/` holds the localhost HTTP side, which is the two endpoints real Cognito serves without any
authentication: `/<userPoolId>/.well-known/jwks.json` and
`/<userPoolId>/.well-known/openid-configuration`. `SimCognitoServiceController` is the controller the
serving layer dispatches to, `SimCognitoOpenIdConfiguration` builds the discovery document, and
`SimCognitoEndpointResponse` builds the responses. The Cognito API itself is not served: an SDK
client reaches the simulator through `SimSdk`.

`/<userPoolId>/messages` is served alongside them, and real Cognito has no such endpoint. It is the
serving side of `SimCognitoUserPool.sentMessages`, so a browser or a curl can read what a pool would
have sent during local development, and it is a divergence for the same reason that accessor is one.

The request hostname is `cognito-idp.<region>`, which names the regional endpoint rather than one
pool, so the pool id comes from the path. That id says nothing about the Account that owns the pool,
so `SimCognitoUserPoolRegistry` in `registry/` indexes pools across every Account and Region of one
simulation, in the same way `SimLambdaUrlRegistry` indexes Function URL ids. It is also what pool
ids are allocated against, so no two Accounts can hold the same one.

## Authentication model

Sign-in state lives under `user-pool/auth/`.

`SimCognitoPoolAuth` is a pool's authentication state: the sign-ins part way through it, and the
tokens the finished ones handed out. The two live together because signing a user out reaches both,
and because keeping them here leaves `SimCognitoUserPool` as what it is elsewhere, a resource
holding its contents.

`SimCognitoAuthSession` is what an unfinished authentication carries between the request that started
it and the response that completes it. A session is opaque, single use, tied to its user and app
client, and lasts the three minutes real Cognito gives one.

`SimCognitoIssuedToken` is a token the pool has handed out, and `SimCognitoIssuedTokenStore` holds
them. A refresh token is kept because the pool is what exchanges it later, and an access token
because the pool is what a sign-out presents one to. Signing a user out forgets both kinds, which is
what makes a later refresh fail: real Cognito revokes a signed-out user's tokens rather than waiting
for them to run out. Deleting a user does the same, so no token outlives the user it names.

`SimCognitoUserPoolStore.requireClient` and `.requireAccessToken` are the scope-wide lookups the
client-side operations need. `InitiateAuth` names an app client and no pool, and `GlobalSignOut`
names neither, so the client id and the access token are what find the pool.

`requireSimCognitoSecretHash` checks the `SECRET_HASH` a client with a secret has to send, computed
the way the AWS SDKs compute it. Checking it is what makes a test notice a client secret it forgot to
use.

`SimCognitoUserPassword` holds what a user signs in with. It answers whether a candidate matches and
nothing exposes it, the same modelling choice simulated KMS key material makes.

## Lambda trigger model

Trigger state and the running of a trigger live under `user-pool/trigger/`.

`SimCognitoLambdaConfig` is the `LambdaConfig` a pool was created or updated with. It holds the
function ARN each trigger names and resolves nothing, so a pool can be created before the function
it names, and a function deleted afterwards fails the request rather than having silently broken the
pool. Every `LambdaConfig` key this simulation does not run is refused there, naming the trigger,
because a pool that accepted one would never call the function the template named.

`SimCognitoTriggerOccasion` is a trigger paired with the `triggerSource` of one occasion it fires
on. The two are not the same thing: `PreSignUp` fires both on `SignUp` and on `AdminCreateUser`, and
a handler tells them apart by the source. Pairing them in a value object is what stops a source
being derived from a trigger name, which would only work while every trigger had one.

`SimCognitoUserPoolTriggers` runs them. A pool with no trigger for the occasion runs nothing and
costs a map lookup. A pool with one checks the function's resource policy, invokes it, waits, and
refuses what came back unless it is the event the handler was given. The policy is checked on every
invocation rather than remembered, because a permission revoked afterwards stops the trigger on real
Cognito too.

`SimCognitoTriggerEvent` and `SimCognitoTriggerRequest` build the event document, which is the real
shape down to the `response` a `PreSignUp` handler is sent with its three flags already set to
false. `SimCognitoTriggerContext` is what an operation hands them: the pool, the user, the app
client where there is one, and the client metadata and validation data the request carried.

`SimCognitoPreSignUpResponse` reads what a `PreSignUp` handler answered. It is the only trigger here
whose response is read, and the reading is lenient in the same way real Cognito is: anything but
`true` is no, and a handler that dropped the response has asked for nothing.

`SimAwsCognitoTriggerFunctions` is the bridge to simulated Lambda, and
`SimCognitoNoTriggerFunctions` is what a standalone `SimCognitoIdentityProvider` gets instead. The
functions come from the whole simulation rather than from the pool's own scope, because a
`LambdaConfig` names a function by ARN and that ARN can name any Account and Region.

## Command handling

AWS SDK-style operations are implemented under `command/`, grouped by the collaborators they share
rather than one class per command, so the `SimCognitoIdentityProvider` facade stays a delegation:

- `command/user-pool/`: the pool commands, their structural input/output types and their output
  views
- `command/client/`: the same for app clients
- `command/user/`: the same for users, split between the commands that create, read and delete one,
  the commands that change one afterwards, and the commands a user signs itself up with. The
  sign-up ones resolve their pool through an app client id the way the client-side sign-in commands
  do, so they share `SimCognitoAuthResolver` with them
- `command/group/`: the same for groups, split between the commands that act on a group and the
  commands that move users in and out of one
- `command/auth/`: the four sign-in operations and the two sign-out ones, the flow and challenge
  names they accept, and the parameters they read
- `command/authorize/`: the shared IAM authorizer
- `command/sim-cognito-page.ts`: the paging every listing shares, which takes the names of the
  inputs it is reading because `ListUsers` calls its page size `Limit` and its token
  `PaginationToken`, while the group listings call theirs `Limit` and `NextToken`
- `command/sim-cognito-commands.ts`: builds the command handlers with the authorizer, pool store
  and clock they share, so the service facade stays delegation. The authentication ones are built by
  `command/auth/sim-cognito-auth-commands.ts`, because the collaborators they share are theirs alone

The four sign-in commands are thin because the parts they share are collaborators.
`SimCognitoAuthFlow` knows a flow's name, the `ExplicitAuthFlows` entry that opens it and the legacy
entry it replaced; `SimCognitoAuthFlows` is the set one entry point runs, which is why
`ADMIN_USER_PASSWORD_AUTH` is refused for `InitiateAuth` as it is on real Cognito.
`SimCognitoAuthFlowRunner` runs the resolved flow through `SimCognitoPasswordSignIn` or
`SimCognitoRefreshSignIn`, and `SimCognitoNewPasswordResponse` is the body both challenge responses
share, and refuses a user disabled since the challenge was issued, because a disabled user cannot
finish a sign-in any more than it can start one. What is left in each command is how it reaches the
pool and what it is allowed to run.

`SimCognitoRequestResolver` is what every user and group operation starts with: authorize against
the pool's ARN, then find the pool. Neither a user nor a group has an ARN of its own, so the pool's
is what IAM sees. An operation naming an existing user or group goes on to resolve it; the ones that
create or list stop at the pool.

`SimCognitoUnsimulatedUserPoolOptions`, `SimCognitoUnsimulatedUserPoolClientOptions` and
`SimCognitoUnsimulatedUserOptions` gather every input this simulation refuses, in one readable place
each, rather than scattering the refusals through the creation path.

As elsewhere, implementation code under `src/` does not import real AWS SDK packages. The structural
command types in `*.command.ts` match the SDK shapes closely enough for callers to pass real SDK
command instances.

## Authorization

`SimCognitoAuthorizer` splits requests two ways, as real Cognito does:

- operations on a pool, and on the app clients and users in it, authorize the real IAM action
  against that pool's ARN, whether or not the pool exists, because real IAM evaluates a request
  before the service handles it;
- `CreateUserPool` and `ListUserPools` authorize against `*`, because real Cognito gives those two
  actions no resource-level permissions, so a policy naming individual pool ARNs grants nothing.

`InitiateAuth`, `RespondToAuthChallenge`, `GlobalSignOut`, `SignUp`, `ConfirmSignUp` and
`ResendConfirmationCode` authorize nothing, and read no caller. Real Cognito evaluates no IAM policy
for them: they are what an application calls on behalf of a user, holding no AWS credentials at all. Authorizing them here would pass code that a real
deployment refuses, and refuse code that really works.

A policy granting an app client action on a pool therefore reaches every client in that pool, and a
policy granting a user action reaches every user in it. There is no way to narrow either to one
resource, here or on real AWS.

## Divergences worth knowing

- A user pool reports the confirmation code a signed-up user was issued, through
  `SimCognitoUserPool.confirmationCode`. Real Cognito sends it and never reports it to anyone.
  Nothing here delivers a message, so this is what makes a sign-up flow testable at all.
- `AdminConfirmSignUp` verifies nothing, whatever the pool's `AutoVerifiedAttributes` say, as it
  verifies nothing on real Cognito. `ConfirmSignUp` sets `email_verified` and
  `phone_number_verified` where the user has the attribute to verify, and a `PreSignUp` trigger sets
  them by answering `autoVerifyEmail` or `autoVerifyPhone`.
- `AdminCreateUser` fires `PreSignUp` and never fires `PostConfirmation`, as on real Cognito, and
  what a handler answered is ignored on that occasion. It is the tempting place to hang a user
  record and the wrong one.
- A confirmation code never expires, where a real one lasts 24 hours. `ResendConfirmationCode` is
  what replaces one.
- `ForgotPassword`, `ConfirmForgotPassword` and `ChangePassword` are not implemented, so
  `RESET_REQUIRED` is a status no user here reaches.
- A client-side sign-up operation naming a user the pool does not hold reports it, whatever the app
  client's `PreventUserExistenceErrors` says. That setting is honoured for sign-in only.
- Every unsimulated `CreateUserPool`, `UpdateUserPool`, `CreateUserPoolClient` and
  `UpdateUserPoolClient` input is refused rather than ignored.
  `UsernameAttributes` is the one that matters most: a pool signing users in by email stores a
  generated UUID as the username, so a pool quietly created without it would answer with the wrong
  username here and the right one on real AWS.
- A pool created with `DeletionProtection: ACTIVE` refuses `DeleteUserPool` until an `UpdateUserPool`
  request deactivates the protection, as real Cognito refuses it.
- `UpdateUserPool` replaces a pool's settings rather than merging into them, so a setting the request
  leaves out goes back to its `CreateUserPool` default, its `LambdaConfig` included. `PoolName` is
  refused, so a pool cannot be renamed here.
- `UpdateUserPoolClient` replaces an app client's settings the same way, so a setting the request
  leaves out goes back to its `CreateUserPoolClient` default. The client's secret is not a setting
  and is left alone.
- An update moves a pool's or an app client's `LastModifiedDate` on, as every operation that changes
  a user moves that user's `UserLastModifiedDate` on.
- `SchemaAttributes` is not reported on a pool, though every pool holds the standard schema and
  validates user attributes against it.
- Users are resolved by username only, and real Cognito also accepts a `sub` there.
- `AdminListGroupsForUser` sorts by precedence. Real Cognito does not document an order for it.
- One signing key is published per pool, where real Cognito publishes two and rotates between them.
- The served OpenID configuration names the localhost origin the request arrived on as its `issuer`,
  because a client that discovers a document has to be able to fetch the keys it points at. A token's
  `iss` claim still names the real AWS URL, which is what a verifier built from a pool id checks
  against, so the two disagree here and agree on real Cognito. The document also names no
  `authorization_endpoint`, `token_endpoint` or `userinfo_endpoint`, as the hosted UI and the OAuth
  endpoints are not simulated.
- The password and refresh flows run on both sides of the API, and only `NEW_PASSWORD_REQUIRED` is
  issued. SRP, `USER_AUTH`, custom authentication, MFA challenges and device tracking are refused
  rather than treated as a flow or challenge that is simulated.
- A `PreTokenGeneration` response is refused where real Cognito would quietly drop part of it: a
  reserved claim, any `cognito:` claim in `claimsToAddOrOverride`, a claim value that is not a
  string, and a group override naming IAM roles. The trigger runs at `V1_0` only, so
  `PreTokenGenerationConfig` is refused, and the group override replacing `cognito:groups` is the
  only change that reaches an access token. The `V2_0` and `V3_0` access token claims and scopes are
  not customised.
- A refresh answers with no new refresh token, as real Cognito does with refresh token rotation off.
  `RefreshTokenRotation` is refused on an app client, and `GetTokensFromRefreshToken` and
  `RevokeToken` are not implemented.
- Signing out revokes the user's tokens here, and a token already handed to a verifier goes on
  verifying against the pool's JWKS until it expires. Verification asks this simulation nothing, so
  nothing here can tell a verifier the token was revoked.
- A verifier reading the host clock judges an already-issued token by host time. Advancing the
  simulated clock moves the timestamps of tokens issued after it, and signing in in the simulated
  past is what produces a token such a verifier refuses.
- `UpdateGroup` replaces all three group properties rather than merging an omitted one.
- A password is held so a user can sign in with it, and nothing reads one back.
- No message is delivered. A pool records what it would have sent, and
  `SimCognitoUserPool.sentMessages` reads it back, which real Cognito reports to nobody.
  `AdminCreateUser` records an invitation, so `MessageAction: SUPPRESS` records none, and `RESEND`
  and `DesiredDeliveryMediums` are refused.
- A verification message is recorded only for an attribute the pool verifies automatically, and only
  where the user has an `email` or a `phone_number` to be reached at.
- An invitation for a user created with no `TemporaryPassword` keeps the `{####}` placeholder: real
  Cognito generates a password there, and this leaves the user with none at all.
- Confirming a sign-up by following a link is refused, so a `CustomMessage` event carries no
  `linkParameter`, and the `CustomEmailSender` and `CustomSMSSender` triggers are refused because
  the AWS Encryption SDK envelope they decrypt is not simulated anywhere here.
- Listings are in creation order and carry no filtering. `ListUsers` refuses a `Filter` rather than
  dropping it, because a dropped filter answers with the wrong users rather than with an error.

The full list is in [docs/services/cognito](../../../docs/services/cognito/).
