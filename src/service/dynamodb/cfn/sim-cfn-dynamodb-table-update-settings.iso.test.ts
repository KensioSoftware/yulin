import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import {
  deployWithOrder,
  storedStatus,
  updateOrdersTable,
} from "./sim-cfn-dynamodb-table-update.test-support.js";

describe("DynamoDB CloudFormation Table update settings", () => {
  it("switches the stream off when the template drops it", async () => {
    // Given a deployed table with a stream.
    const simAws = new SimAws();
    await deployWithOrder(simAws, {
      StreamSpecification: { StreamViewType: "KEYS_ONLY" },
    });

    // When the stack is updated with no StreamSpecification.
    await updateOrdersTable(simAws, {});

    // Then the table reports its stream switched off, and still holds the
    // order.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));
    assertFalse(described.Table?.StreamSpecification?.StreamEnabled);
    assertIdentical(await storedStatus(simAws), "open");
  });

  it("changes the table class and deletion protection", async () => {
    // Given a deployed table of the standard class.
    const simAws = new SimAws();
    await deployWithOrder(simAws);

    // When the stack is updated to the infrequent access class, protected
    // from deletion.
    await updateOrdersTable(simAws, {
      TableClass: "STANDARD_INFREQUENT_ACCESS",
      DeletionProtectionEnabled: true,
    });

    // Then the table reports both.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));
    const table = described.Table;
    assertNonNullable(table);
    assertIdentical(
      table.TableClassSummary?.TableClass,
      "STANDARD_INFREQUENT_ACCESS",
    );
    assertTrue(table.DeletionProtectionEnabled);
  });

  it("fails to switch time to live off within the hour it went on", async () => {
    // Given a table deployed with time to live on.
    const simAws = new SimAws();
    await deployWithOrder(simAws, {
      TimeToLiveSpecification: { AttributeName: "expiresAt", Enabled: true },
    });

    // When the stack is updated straight away to switch it off.
    const error = await assertThrowsErrorAsync(async () => {
      await updateOrdersTable(simAws, {});
    });

    // Then DynamoDB refuses a second change within the hour, as it does on
    // AWS, and the table keeps its order.
    assertStringIncludes(
      error.message,
      "one UpdateTimeToLive per table per hour",
    );
    assertIdentical(await storedStatus(simAws), "open");
  });
});
