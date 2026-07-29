# Simulated Cognito user pools implementation

This directory contains the simulated Cognito user pools implementation. Cognito identity pools,
which exchange a token for AWS credentials, are a separate service and are not simulated at all.

The pool, the app client, the users and groups in it, the admin sign-in flow, the tokens it issues
and the authorizer are all here. The client-side flows are not: `InitiateAuth`, SRP and the hosted
UI are a separate piece of work.

## Entry points

- `sim-cognito-identity-provider.ts` is the main in-memory service object for one account/region
  scope. It holds the pool and app client operations, and extends
  `sim-cognito-user-directory.ts`, which holds the user and group ones. A caller sees one service
  object, as the real API is one service; the split is because a pool's settings and a pool's
  contents are two concerns, and one class holding both had outgrown reading in one sitting.
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

`SimCognitoUser` is the stored user: its username, its `sub`, its attributes, its status and whether
it is enabled. The `sub` is a fresh UUID rather than anything derived from the username, because
that is the difference most code gets wrong. A user holds no password. Passwords are checked against
the pool's policy and discarded, since nothing authenticates yet and nothing reads one back.

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
JWTs. The pair is generated on first use and shared for the process: 2048-bit generation takes long
enough to notice, and a suite makes many pools. Every pool therefore publishes the same key, which a
verifier cannot tell, because it reaches the right pool through the `iss` claim and the JWKS it was
given rather than through the key. Nothing is written to disk and no key material is in the
repository.

`SimCognitoIdToken` and `SimCognitoAccessToken` build the claims of each token, and
`SimCognitoSharedTokenClaims` builds what both carry. They are separate because the difference
between them is the point: an id token has `aud`, `cognito:username` and the user's attributes, and
an access token has `client_id`, `username` and a `scope`. Code reading the wrong one for a claim
fails here the way it fails in production.

`SimCognitoTokenIssuer` ties them together and takes every timestamp from the injectable clock, so a
sign-in in the simulated past produces a token a verifier already considers expired. It also mints
the refresh token, which is an opaque string rather than a JWT, as it is on real Cognito.

## Authentication model

Sign-in state lives under `user-pool/auth/`.

`SimCognitoAuthSession` is what an unfinished authentication carries between the request that started
it and the response that completes it. A session is opaque, single use, tied to its user and app
client, and lasts the three minutes real Cognito gives one.

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
- `command/auth/`: `AdminInitiateAuth` and `AdminRespondToAuthChallenge`, the flow and challenge
  names they accept, and the parameters they read
- `command/authorize/`: the shared IAM authorizer
- `command/sim-cognito-page.ts`: the paging every listing shares, which takes the names of the
  inputs it is reading because `ListUsers` calls its page size `Limit` and its token
  `PaginationToken`, while the group listings call theirs `Limit` and `NextToken`
- `command/sim-cognito-commands.ts`: builds the command handlers with the authorizer, pool store
  and clock they share, so the service facade stays delegation

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
- One signing key is published per pool where real Cognito publishes two and rotates between them,
  and every pool in a process shares it.
- Only `ADMIN_USER_PASSWORD_AUTH` runs, and only `NEW_PASSWORD_REQUIRED` is issued. Every other flow
  and challenge is refused rather than treated as one of those.
- A verifier reading the host clock judges an already-issued token by host time. Advancing the
  simulated clock moves the timestamps of tokens issued after it, and signing in in the simulated
  past is what produces a token such a verifier refuses.
- `UpdateGroup` replaces all three group properties rather than merging an omitted one.
- A password is checked and discarded rather than stored, because nothing authenticates yet.
- No message is delivered, so `AdminCreateUser` accepts `MessageAction: SUPPRESS` and refuses
  `RESEND` and `DesiredDeliveryMediums`.
- Listings are in creation order and carry no filtering. `ListUsers` refuses a `Filter` rather than
  dropping it, because a dropped filter answers with the wrong users rather than with an error.

The full list is in [docs/services/cognito](../../../docs/services/cognito/).
