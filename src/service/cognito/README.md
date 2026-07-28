# Simulated Cognito user pools implementation

This directory contains the simulated Cognito user pools implementation. Cognito identity pools,
which exchange a token for AWS credentials, are a separate service and are not simulated at all.

This is the foundation the rest of simulated Cognito is built on: the pool, the app client, and the
authorizer. Users, groups, tokens and authentication flows are not here yet.

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
Nothing checks a password against the policy yet, since there are no users, but the policy has to be
right now because it is what those checks will read.

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

## Command handling

AWS SDK-style operations are implemented under `command/`, grouped by the collaborators they share
rather than one class per command, so the `SimCognitoIdentityProvider` facade stays a delegation:

- `command/user-pool/` — the pool commands, their structural input/output types and their output
  views
- `command/client/` — the same for app clients
- `command/authorize/` — the shared IAM authorizer
- `command/sim-cognito-page.ts` — the paging both listings share

`SimCognitoUnsimulatedUserPoolOptions` and `SimCognitoUnsimulatedUserPoolClientOptions` gather every
input this simulation refuses, in one readable place each, rather than scattering the refusals
through the creation path.

As elsewhere, implementation code under `src/` does not import real AWS SDK packages. The structural
command types in `*.command.ts` match the SDK shapes closely enough for callers to pass real SDK
command instances.

## Authorization

`SimCognitoAuthorizer` splits requests two ways, as real Cognito does:

- operations on a pool, and on the app clients in it, authorize the real IAM action against that
  pool's ARN, whether or not the pool exists, because real IAM evaluates a request before the service
  handles it;
- `CreateUserPool` and `ListUserPools` authorize against `*`, because real Cognito gives those two
  actions no resource-level permissions, so a policy naming individual pool ARNs grants nothing.

A policy granting an app client action on a pool therefore reaches every client in that pool. There
is no way to narrow it to one client, here or on real AWS.

## Divergences worth knowing

- Every unsimulated `CreateUserPool` and `CreateUserPoolClient` input is refused rather than ignored.
  `UsernameAttributes` is the one that matters most: a pool signing users in by email stores a
  generated UUID as the username, so a pool quietly created without it would answer with the wrong
  username here and the right one on real AWS.
- A pool created with `DeletionProtection: ACTIVE` cannot be deleted at all, because `UpdateUserPool`
  is not simulated and that is the only way to deactivate the protection.
- Nothing changes a pool or an app client after creation, so `LastModifiedDate` is always the
  creation date.
- `SchemaAttributes` is not reported on a pool. Real Cognito reports the standard attribute schema on
  every pool; there are no user attributes here to describe.
- Listings are in creation order and carry no filtering.

The full list is in [docs/services/cognito](../../../docs/services/cognito/).
