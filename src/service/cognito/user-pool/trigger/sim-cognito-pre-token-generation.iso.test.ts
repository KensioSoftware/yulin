import {
  AdminAddUserToGroupCommand,
  CreateGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertUndefined,
} from "@kensio/smartass";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { describe, it } from "vitest";

import {
  makeTriggerPool,
  makeTriggerUser,
  triggerFunctionArn,
} from "../../../../../test/cognito/trigger-fixture.js";
import { recordingTriggerHandler } from "../../../../../test/cognito/trigger-handler-fixture.js";
import { claimsOverrideHandler } from "../../../../../test/cognito/trigger-handler-fixture.js";
import {
  signInToTriggerPool,
  triggerTokenClaims,
} from "../../../../../test/cognito/trigger-token-fixture.js";
import type { SimCognitoTriggerPool } from "../../../../../test/cognito/trigger-fixture.js";

/**
 * A pool whose PreTokenGeneration handler answers with these override details,
 * and a user ready to sign in.
 */
async function poolOverriding(
  details: unknown,
): Promise<SimCognitoTriggerPool> {
  const pool = await makeTriggerPool({
    triggers: { PreTokenGeneration: triggerFunctionArn },
    handler: claimsOverrideHandler(details),
  });

  await makeTriggerUser(pool);

  return pool;
}

/**
 * Put the user in a group, so the tokens it signs in for carry a
 * `cognito:groups` claim for a handler to replace.
 */
async function addToGroup(
  pool: SimCognitoTriggerPool,
  groupName: string,
): Promise<void> {
  await pool.cognito.createGroup(
    new CreateGroupCommand({
      UserPoolId: pool.userPoolId,
      GroupName: groupName,
    }),
  );
  await pool.cognito.adminAddUserToGroup(
    new AdminAddUserToGroupCommand({
      UserPoolId: pool.userPoolId,
      Username: "alice",
      GroupName: groupName,
    }),
  );
}

describe("sim Cognito PreTokenGeneration trigger", () => {
  it("puts a claim the handler added on the id token", async () => {
    // Given a pool whose token trigger adds a tenant to every id token.
    const pool = await poolOverriding({
      claimsToAddOrOverride: { tenantId: "acme" },
    });

    // When the user signs in.
    const { idToken, accessToken } = await signInToTriggerPool(pool);

    // Then the id token carries the claim the handler asked for.
    assertIdentical(triggerTokenClaims(idToken)["tenantId"], "acme");

    // And the access token does not: a V1_0 trigger customises the id token.
    assertUndefined(triggerTokenClaims(accessToken)["tenantId"]);
  });

  it("signs the overridden id token so it still verifies", async () => {
    // Given a signed-in user of a pool that adds a claim, and a verifier
    // configured for the pool rather than told what to expect.
    const pool = await poolOverriding({
      claimsToAddOrOverride: { tenantId: "acme" },
    });
    const { idToken } = await signInToTriggerPool(pool);
    const verifier = CognitoJwtVerifier.create({
      userPoolId: pool.userPoolId,
      tokenUse: "id",
      clientId: pool.clientId,
    });

    verifier.cacheJwks(pool.cognito.userPool(pool.userPoolId).jwks());

    // When the verifier verifies the token.
    const payload = await verifier.verify(idToken);

    // Then it passes with the added claim on it, so the trigger changed the
    // claims before the pool signed them rather than after.
    assertIdentical(payload["tenantId"], "acme");
    assertIdentical(payload.token_use, "id");
  });

  it("overrides a claim the token would otherwise carry", async () => {
    // Given a handler that replaces the user's email.
    const pool = await poolOverriding({
      claimsToAddOrOverride: { email: "alice@acme.example" },
    });

    // When the user signs in.
    const { idToken } = await signInToTriggerPool(pool);

    // Then the token carries the handler's value rather than the attribute's.
    assertIdentical(triggerTokenClaims(idToken)["email"], "alice@acme.example");
  });

  it("removes a claim the handler suppressed", async () => {
    // Given a handler that keeps the user's email off the token.
    const pool = await poolOverriding({ claimsToSuppress: ["email"] });

    // When the user signs in.
    const { idToken } = await signInToTriggerPool(pool);

    // Then the claim is gone rather than empty.
    assertUndefined(triggerTokenClaims(idToken)["email"]);
  });

  it("suppresses a claim it was asked to override as well", async () => {
    // Given a handler that names the same claim in both fields, which real
    // Cognito resolves by suppressing it.
    const pool = await poolOverriding({
      claimsToAddOrOverride: { email: "alice@acme.example" },
      claimsToSuppress: ["email"],
    });

    // When the user signs in.
    const { idToken } = await signInToTriggerPool(pool);

    // Then the claim is suppressed, rather than carrying the value the same
    // response asked for.
    assertUndefined(triggerTokenClaims(idToken)["email"]);
  });

  it("replaces the groups claim rather than adding to it", async () => {
    // Given a user in a group of the pool, and a handler that names another.
    const pool = await poolOverriding({
      groupOverrideDetails: { groupsToOverride: ["tenant-admin"] },
    });

    await addToGroup(pool, "staff");

    // When the user signs in.
    const { idToken, accessToken } = await signInToTriggerPool(pool);

    // Then the claim holds the handler's groups alone, on both tokens: the
    // group override is the one change a V1_0 event makes to an access token.
    assertArrayEquals(triggerTokenClaims(idToken)["cognito:groups"], [
      "tenant-admin",
    ]);
    assertArrayEquals(triggerTokenClaims(accessToken)["cognito:groups"], [
      "tenant-admin",
    ]);
  });

  it("suppresses the groups for a group override naming none", async () => {
    // Given a user in a group, and a handler answering with an empty group
    // override, which real Cognito reads as suppressing the groups.
    const pool = await poolOverriding({ groupOverrideDetails: {} });

    await addToGroup(pool, "staff");

    // When the user signs in.
    const { idToken } = await signInToTriggerPool(pool);

    // Then the token carries no groups claim at all, rather than an empty list.
    assertUndefined(triggerTokenClaims(idToken)["cognito:groups"]);
  });

  it("reads a response of nulls as asking for nothing but the groups", async () => {
    // Given a handler whose response carries the fields at null, as a handler
    // building its response from optional values produces.
    const pool = await poolOverriding({
      claimsToAddOrOverride: null,
      claimsToSuppress: null,
      groupOverrideDetails: null,
    });

    await addToGroup(pool, "staff");

    // When the user signs in.
    const { idToken } = await signInToTriggerPool(pool);

    // Then the claims stand, and the null group override suppresses the groups
    // as an empty one does.
    assertIdentical(triggerTokenClaims(idToken)["email"], "alice@example.com");
    assertUndefined(triggerTokenClaims(idToken)["cognito:groups"]);
  });

  it("gives the handler the user's groups and the occasion it fired on", async () => {
    // Given a pool recording the event its token trigger is given.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { PreTokenGeneration: triggerFunctionArn },
      handler: recordingTriggerHandler(events),
    });

    await makeTriggerUser(pool);
    await addToGroup(pool, "staff");

    // When the user signs in, with metadata on the request.
    await signInToTriggerPool(pool, { tenant: "acme" });

    // Then the handler was given the real event, naming the occasion and the
    // groups the user is in.
    assertObjectMatches(events[0], {
      triggerSource: "TokenGeneration_Authentication",
      userName: "alice",
      request: {
        userAttributes: { email: "alice@example.com" },
        groupConfiguration: { groupsToOverride: ["staff"] },
      },
      response: {},
    });

    // And no client metadata: real Cognito passes an InitiateAuth request's on
    // to the authentication triggers and not to this one.
    assertUndefined(
      (events[0] as { request: { clientMetadata?: object } }).request
        .clientMetadata,
    );
  });

  it("issues the ordinary claims for a handler that wrote no response", async () => {
    // Given a token trigger that hands the event straight back, which is what a
    // handler with nothing to say does.
    const pool = await makeTriggerPool({
      triggers: { PreTokenGeneration: triggerFunctionArn },
      handler: (event: unknown) => {
        const { response, ...rest } = event as { response: unknown };

        assertNonNullable(response);

        return rest;
      },
    });

    await makeTriggerUser(pool);

    // When the user signs in.
    const { idToken } = await signInToTriggerPool(pool);

    // Then the token carries what the pool was going to issue anyway.
    assertIdentical(triggerTokenClaims(idToken)["email"], "alice@example.com");
    assertIdentical(triggerTokenClaims(idToken)["cognito:username"], "alice");
  });
});
