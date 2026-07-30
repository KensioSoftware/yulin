# Simulated Cognito user pools implementation

This directory contains the simulated Cognito user pools implementation. Cognito identity pools,
which exchange a token for AWS credentials, are a separate service and are not simulated at all.

The pool, the app client, the users and groups in it, the sign-in flows on both sides of the API,
the tokens it issues and the authorizer are all here. SRP, the hosted UI, MFA and device tracking
are not.

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

`SimCognitoUserPool` is the stored resource: its id, its ARN, its password policy, its deletion
protection, and its app clients. The pool owns the clients rather than a separate store owning them,
because that is where they live on real Cognito: deleting a pool takes its clients with it, and a
client id means nothing outside the pool that issued it.

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

`makeSimCognitoClientSecret` generates a client secret, and only a client created with
`GenerateSecret` gets one. A public client has no secret at all rather than an empty one, which is
what makes code computing a `SECRET_HASH` fail on the client it should fail on.

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

`SimCognitoUserStatus` holds the two statuses this simulation can reach, and the transition between
them. `AdminCreateUser` leaves a user in `FORCE_CHANGE_PASSWORD`, and only a permanent password
reaches `CONFIRMED`. The rest of the real statuses belong to sign-up, resets and federation, none of
which are simulated.

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

`Ref` and `Fn::GetAtt` live in `cloudformation/resource/cfn/cognito/`, one adapter per Resource
type, rather than on the service objects.

## Served pool endpoints

`serve/` holds the localhost HTTP side, which is the two endpoints real Cognito serves without any
authentication: `/<userPoolId>/.well-known/jwks.json` and
`/<userPoolId>/.well-known/openid-configuration`. `SimCognitoServiceController` is the controller the
serving layer dispatches to, `SimCognitoOpenIdConfiguration` builds the discovery document, and
`SimCognitoEndpointResponse` builds the responses. The Cognito API itself is not served: an SDK
client reaches the simulator through `SimSdk`.

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

## Command handling

AWS SDK-style operations are implemented under `command/`, grouped by the collaborators they share
rather than one class per command, so the `SimCognitoIdentityProvider` facade stays a delegation:

- `command/user-pool/`: the pool commands, their structural input/output types and their output
  views
- `command/client/`: the same for app clients
- `command/user/`: the same for users, split between the commands that create, read and delete one
  and the commands that change one afterwards
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

`InitiateAuth`, `RespondToAuthChallenge` and `GlobalSignOut` authorize nothing, and read no caller.
Real Cognito evaluates no IAM policy for them: they are what an application calls on behalf of a
user, holding no AWS credentials at all. Authorizing them here would pass code that a real
deployment refuses, and refuse code that really works.

A policy granting an app client action on a pool therefore reaches every client in that pool, and a
policy granting a user action reaches every user in it. There is no way to narrow either to one
resource, here or on real AWS.

## Divergences worth knowing

- Every unsimulated `CreateUserPool` and `CreateUserPoolClient` input is refused rather than ignored.
  `UsernameAttributes` is the one that matters most: a pool signing users in by email stores a
  generated UUID as the username, so a pool quietly created without it would answer with the wrong
  username here and the right one on real AWS.
- A pool created with `DeletionProtection: ACTIVE` cannot be deleted at all, because `UpdateUserPool`
  is not simulated and that is the only way to deactivate the protection.
- Nothing changes a pool or an app client after creation, so `LastModifiedDate` is always the
  creation date. A user is different: every operation that changes one moves its
  `UserLastModifiedDate` on.
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
- No message is delivered, so `AdminCreateUser` accepts `MessageAction: SUPPRESS` and refuses
  `RESEND` and `DesiredDeliveryMediums`.
- Listings are in creation order and carry no filtering. `ListUsers` refuses a `Filter` rather than
  dropping it, because a dropped filter answers with the wrong users rather than with an error.

The full list is in [docs/services/cognito](../../../docs/services/cognito/).
