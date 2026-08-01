import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";
import type { SimDynamoDbTimeToLiveSpecificationInput } from "./time-to-live.types.js";

/**
 * Update time to live with a specification real DynamoDB would refuse, and read
 * the refusal.
 *
 * The commands are built structurally rather than from the SDK, since the SDK's
 * own types stop some of this input at the compiler and a caller not using them
 * still reaches the same validation.
 */
async function refusedTimeToLiveUpdate(
  specification: SimDynamoDbTimeToLiveSpecificationInput | undefined,
): Promise<Error> {
  const simAws = new SimAws();
  await simDynamoDbCreatedTableFactory.make({ tableName: "Sessions" }, simAws);

  return await assertThrowsErrorAsync(async () =>
    simAws.dynamoDb().updateTimeToLive({
      input: { TableName: "Sessions", TimeToLiveSpecification: specification },
    }),
  );
}

describe("DynamoDB UpdateTimeToLiveCommand validation", () => {
  it("requires a specification", async () => {
    // When time to live is updated with no specification.
    const error = await refusedTimeToLiveUpdate(undefined);

    // Then the missing specification is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "TimeToLiveSpecification is required to update time to live",
    );
  });

  it("requires an attribute name", async () => {
    // When time to live is switched on without naming an attribute.
    const error = await refusedTimeToLiveUpdate({ Enabled: true });

    // Then the missing attribute name is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "TimeToLiveSpecification.AttributeName is required",
    );
  });

  it("refuses an empty attribute name", async () => {
    // When time to live is switched on with an empty attribute name.
    const error = await refusedTimeToLiveUpdate({
      Enabled: true,
      AttributeName: "",
    });

    // Then it is refused the same way a missing one is.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "TimeToLiveSpecification.AttributeName is required",
    );
  });

  it("refuses an attribute name longer than DynamoDB takes", async () => {
    // When time to live names an attribute of 256 characters.
    const error = await refusedTimeToLiveUpdate({
      Enabled: true,
      AttributeName: "e".repeat(256),
    });

    // Then the length is reported against the limit.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "has a length of 256");
  });

  it("requires Enabled either way", async () => {
    // When a specification names an attribute but does not say whether time to
    // live is on. Real DynamoDB requires both fields, including when switching
    // time to live off.
    const error = await refusedTimeToLiveUpdate({ AttributeName: "expiresAt" });

    // Then the missing field is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "TimeToLiveSpecification.Enabled is required",
    );
  });
});
