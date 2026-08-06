import {
  assertArrayEquals,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  makeTriggerPool,
  makeTriggerUser,
  triggerFunctionArn,
} from "../../../../../test/cognito/trigger-fixture.js";
import { claimsOverrideHandler } from "../../../../../test/cognito/trigger-handler-fixture.js";
import {
  signInToTriggerPool,
  triggerTokenClaims,
} from "../../../../../test/cognito/trigger-token-fixture.js";

/**
 * Sign in against a pool whose token trigger answers with these override
 * details, and answer with the refusal the sign-in failed with.
 */
async function refusalOf(details: unknown): Promise<Error> {
  const pool = await makeTriggerPool({
    triggers: { PreTokenGeneration: triggerFunctionArn },
    handler: claimsOverrideHandler(details),
  });

  await makeTriggerUser(pool);

  const error = await assertThrowsErrorAsync(async () =>
    signInToTriggerPool(pool),
  );

  // Every refusal here is the one real Cognito reports for a response it could
  // not act on.
  assertIdentical(error.name, "InvalidLambdaResponseException");

  return error;
}

describe("sim Cognito PreTokenGeneration claims override refusals", () => {
  it("refuses an override of a reserved claim, naming it", async () => {
    // Given a handler trying to put its own value in `sub`, which real Cognito
    // drops without saying so.
    // When the user signs in.
    const error = await refusalOf({
      claimsToAddOrOverride: { sub: "00000000-0000-0000-0000-000000000000" },
    });

    // Then the sign-in is refused, naming the claim, rather than answering with
    // a token that does not carry what the handler asked for.
    assertStringIncludes(error.message, "claimsToAddOrOverride");
    assertStringIncludes(error.message, "the reserved claim sub");
  });

  it("refuses suppressing a claim a token has to carry", async () => {
    // Given a handler suppressing the expiry.
    // When the user signs in.
    const error = await refusalOf({ claimsToSuppress: ["exp"] });

    // Then it is refused, because real Cognito issues that claim whatever a
    // handler says about it.
    assertStringIncludes(error.message, "claimsToSuppress");
    assertStringIncludes(error.message, "the reserved claim exp");
  });

  it("points a groups override at the field that changes it", async () => {
    // Given a handler adding the groups claim as an ordinary claim.
    // When the user signs in.
    const error = await refusalOf({
      claimsToAddOrOverride: { "cognito:groups": "tenant-admin" },
    });

    // Then it says where a group change belongs, because real Cognito ignores
    // the claim there.
    assertStringIncludes(error.message, "cognito:groups");
    assertStringIncludes(
      error.message,
      "groupOverrideDetails.groupsToOverride",
    );
  });

  it("refuses an override of any other cognito claim", async () => {
    // Given a handler renaming the user.
    // When the user signs in.
    const error = await refusalOf({
      claimsToAddOrOverride: { "cognito:username": "bob" },
    });

    // Then it is refused: Cognito reserves the whole prefix.
    assertStringIncludes(error.message, "cognito:username");
    assertStringIncludes(error.message, "reserves the cognito: claims");
  });

  it("refuses suppressing a cognito claim other than the groups", async () => {
    // Given a handler suppressing the roles claim directly, which real Cognito
    // takes off a token by suppressing cognito:groups instead.
    // When the user signs in.
    const error = await refusalOf({ claimsToSuppress: ["cognito:roles"] });

    // Then it is refused, and told which claim to name.
    assertStringIncludes(error.message, "cognito:roles");
    assertStringIncludes(
      error.message,
      "cognito:groups is the only cognito: claim",
    );
  });

  it("refuses a claim value that is not a string", async () => {
    // Given a handler adding a number, which arrived with the V2_0 event.
    // When the user signs in.
    const error = await refusalOf({
      claimsToAddOrOverride: { seats: 12 },
    });

    // Then it is refused rather than put on a token a V1_0 trigger would not
    // have produced.
    assertStringIncludes(error.message, "value for seats that is not a string");
    assertStringIncludes(error.message, "V2_0");
  });

  it("refuses a group override naming IAM roles", async () => {
    // Given a handler that overrides the roles alongside the groups.
    // When the user signs in.
    const error = await refusalOf({
      groupOverrideDetails: {
        groupsToOverride: ["tenant-admin"],
        iamRolesToOverride: ["arn:aws:iam::111111111111:role/TenantAdmin"],
      },
    });

    // Then it is refused rather than applying the groups and dropping the
    // roles, since the claims they feed are not issued here.
    assertStringIncludes(error.message, "iamRolesToOverride");
    assertStringIncludes(error.message, "cognito:roles");
  });

  it("refuses a group override naming a preferred role", async () => {
    // Given a handler naming the role a member of the group prefers.
    // When the user signs in.
    const error = await refusalOf({
      groupOverrideDetails: {
        groupsToOverride: ["tenant-admin"],
        preferredRole: "arn:aws:iam::111111111111:role/TenantAdmin",
      },
    });

    // Then it is refused for the same reason.
    assertStringIncludes(error.message, "preferredRole");
    assertStringIncludes(error.message, "cognito:preferred_role");
  });

  it("refuses override details that are not an object", async () => {
    // Given a handler answering with a string where the details belong.
    // When the user signs in.
    const error = await refusalOf("everything");

    // Then it is refused, rather than read as asking for nothing.
    assertStringIncludes(
      error.message,
      "a claimsOverrideDetails that is not an object",
    );
  });

  it("refuses claims to suppress that are not a list", async () => {
    // Given a handler naming one claim to suppress without the list around it.
    // When the user signs in.
    const error = await refusalOf({ claimsToSuppress: "email" });

    // Then it is refused rather than read a character at a time.
    assertStringIncludes(
      error.message,
      "a claimsToSuppress that is not a list",
    );
  });

  it("refuses a group in a group override that is not a string", async () => {
    // Given a handler naming a group by something other than its name.
    // When the user signs in.
    const error = await refusalOf({
      groupOverrideDetails: { groupsToOverride: [7] },
    });

    // Then it is refused, because a group is named by its name.
    assertStringIncludes(
      error.message,
      "a groupsToOverride holding something that is not a string",
    );
  });

  it("refuses claims to add that are not an object", async () => {
    // Given a handler answering with a list of claims rather than a map.
    // When the user signs in.
    const error = await refusalOf({ claimsToAddOrOverride: ["tenantId"] });

    // Then it is refused: the field is a map of claim to value.
    assertStringIncludes(
      error.message,
      "a claimsToAddOrOverride that is not an object",
    );
  });

  it("accepts a group override whose role fields name nothing", async () => {
    // Given a handler that carries the role fields empty, as one copying the
    // request's group configuration back produces.
    const pool = await makeTriggerPool({
      triggers: { PreTokenGeneration: triggerFunctionArn },
      handler: claimsOverrideHandler({
        groupOverrideDetails: {
          groupsToOverride: ["tenant-admin"],
          iamRolesToOverride: [],
          preferredRole: null,
        },
      }),
    });

    await makeTriggerUser(pool);

    // When the user signs in.
    const { idToken } = await signInToTriggerPool(pool);

    // Then the groups are applied: naming no role asks for nothing this
    // simulation would have had to drop.
    assertArrayEquals(triggerTokenClaims(idToken)["cognito:groups"], [
      "tenant-admin",
    ]);
  });

  it("ignores a response that is not an object at all", async () => {
    // Given a handler that replaced the response with a string, which real
    // Cognito reads nothing out of.
    const pool = await makeTriggerPool({
      triggers: { PreTokenGeneration: triggerFunctionArn },
      handler: (event: unknown) => ({
        ...(event as object),
        response: "done",
      }),
    });

    await makeTriggerUser(pool);

    // When the user signs in.
    const { idToken } = await signInToTriggerPool(pool);

    // Then the tokens are the ones the pool was going to issue, rather than the
    // sign-in failing over a response that asked for nothing.
    assertIdentical(triggerTokenClaims(idToken)["cognito:username"], "alice");
    assertUndefined(triggerTokenClaims(idToken)["cognito:groups"]);
  });
});
