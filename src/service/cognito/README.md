# Simulated Cognito user pools implementation

This directory contains the simulated Cognito user pools implementation. Cognito identity pools,
which exchange a token for AWS credentials, are a separate service and are not simulated at all.

The pool, the app client, the users in it and the authorizer are here. An app client's
authentication flows are validated and stored, and nothing acts on them: groups, tokens and sign-in
itself are not here yet.

## Entry points

- `sim-cognito-identity-provider.ts` is the main in-memory service object for one account/region
  scope.
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

## Command handling

AWS SDK-style operations are implemented under `command/`, grouped by the collaborators they share
rather than one class per command, so the `SimCognitoIdentityProvider` facade stays a delegation:

- `command/user-pool/`: the pool commands, their structural input/output types and their output
  views
- `command/client/`: the same for app clients
- `command/user/`: the same for users, split between the commands that create, read and delete one
  and the commands that change one afterwards
- `command/authorize/`: the shared IAM authorizer
- `command/sim-cognito-page.ts`: the paging every listing shares, which takes the names of the
  inputs it is reading because `ListUsers` calls them `Limit` and `PaginationToken`
- `command/sim-cognito-commands.ts`: builds the command handlers with the authorizer, pool store
  and clock they share, so the service facade stays delegation

`SimCognitoUserResolver` is what every user operation starts with: authorize against the pool's ARN,
then find the pool, then find the user. A user has no ARN of its own, so the pool's is what IAM
sees.

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
- A password is checked and discarded rather than stored, because nothing authenticates yet.
- No message is delivered, so `AdminCreateUser` accepts `MessageAction: SUPPRESS` and refuses
  `RESEND` and `DesiredDeliveryMediums`.
- Listings are in creation order and carry no filtering. `ListUsers` refuses a `Filter` rather than
  dropping it, because a dropped filter answers with the wrong users rather than with an error.

The full list is in [docs/services/cognito](../../../docs/services/cognito/).
