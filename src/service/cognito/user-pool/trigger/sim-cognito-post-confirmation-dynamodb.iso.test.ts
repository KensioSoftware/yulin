import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  makeUserWritingPool,
  readUserItem,
} from "../../../../../test/cognito/post-confirmation-table-fixture.js";
import {
  confirmTriggerSignUp,
  signUpTriggerUser,
} from "../../../../../test/cognito/trigger-fixture.js";

describe("sim Cognito PostConfirmation trigger writing to DynamoDB", () => {
  it("writes the confirmed user to a simulated table", async () => {
    // Given a pool whose PostConfirmation trigger puts a user item, and an
    // execution role allowed to write it.
    const pool = await makeUserWritingPool(true);
    const signedUp = await signUpTriggerUser(pool);

    assertNonNullable(signedUp.UserSub);

    // When the user confirms with the code the pool issued.
    await confirmTriggerSignUp(pool);

    // Then the handler wrote the item, keyed on the sub the pool allocated
    // rather than on the username.
    const item = await readUserItem(pool, signedUp.UserSub);

    assertNonNullable(item);
    assertIdentical(item["email"]?.S, "alice@example.com");
    assertIdentical(item["username"]?.S, "alice");
  });

  it("fails the confirmation when the execution role cannot write", async () => {
    // Given the same pool, with an execution role holding no dynamodb:PutItem
    // grant.
    const pool = await makeUserWritingPool(false);
    const signedUp = await signUpTriggerUser(pool);

    assertNonNullable(signedUp.UserSub);

    // When the user confirms.
    const error = await assertThrowsErrorAsync(async () =>
      confirmTriggerSignUp(pool),
    );

    // Then the denial reaches the caller rather than the handler silently
    // writing nothing.
    assertIdentical(error.name, "UserLambdaValidationException");
    assertStringIncludes(error.message, "PostConfirmation failed with error");
    assertStringIncludes(error.message, "dynamodb:PutItem");

    // And the table is still empty.
    assertUndefined(await readUserItem(pool, signedUp.UserSub));
  });
});
