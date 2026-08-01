import {
  ListTagsOfResourceCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbUnsupportedOperation,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

/**
 * The ARN of a table nothing created, in the scope the request is made in.
 */
function missingTableArn(simAws: SimAws): string {
  return (
    `arn:aws:dynamodb:${simAws.defaultRegionName}:` +
    `${simAws.defaultAccountId}:table/MissingTable`
  );
}

describe("DynamoDB tag command resource ARNs", () => {
  it("refuses an ARN naming no table", async () => {
    // Given a simulated DynamoDB holding a different table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    const arn = missingTableArn(simAws);

    // When each of the tag commands names a table that is not there.
    const tagging = await assertThrowsErrorAsync(async () =>
      simDynamoDb.tagResource(
        new TagResourceCommand({
          ResourceArn: arn,
          Tags: [{ Key: "Environment", Value: "test" }],
        }),
      ),
    );
    const untagging = await assertThrowsErrorAsync(async () =>
      simDynamoDb.untagResource(
        new UntagResourceCommand({
          ResourceArn: arn,
          TagKeys: ["Environment"],
        }),
      ),
    );
    const listing = await assertThrowsErrorAsync(async () =>
      simDynamoDb.listTagsOfResource(
        new ListTagsOfResourceCommand({ ResourceArn: arn }),
      ),
    );

    // Then all three answer the same way.
    assertInstanceOf(tagging, SimDynamoDbResourceNotFoundException);
    assertInstanceOf(untagging, SimDynamoDbResourceNotFoundException);
    assertInstanceOf(listing, SimDynamoDbResourceNotFoundException);
  });

  it("refuses a table name where an ARN belongs", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    // When a tag command names it by name.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.listTagsOfResource(
        new ListTagsOfResourceCommand({ ResourceArn: "OrdersTable" }),
      ),
    );

    // Then it is refused rather than resolved, since real DynamoDB takes an
    // ARN here.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "ListTagsOfResource requires a ResourceArn naming the resource to work " +
        "on, as an ARN rather than a name",
    );
  });

  it("requires a ResourceArn", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When a tag command names no resource at all.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().tagResource({
        input: { Tags: [{ Key: "Environment", Value: "test" }] },
      }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "TagResource requires a ResourceArn");
  });

  it("requires the Tags and TagKeys a request works with", async () => {
    // Given a table.
    const simAws = new SimAws();
    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    // When a tag request names no tags, and an untag request names no keys.
    const tagging = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().tagResource({ input: { ResourceArn: table.arn } }),
    );
    const untagging = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().untagResource({ input: { ResourceArn: table.arn } }),
    );

    // Then both are refused, since each parameter is required rather than a
    // call that changes nothing.
    assertInstanceOf(tagging, SimDynamoDbValidationException);
    assertStringIncludes(tagging.message, "TagResource requires Tags");
    assertInstanceOf(untagging, SimDynamoDbValidationException);
    assertStringIncludes(untagging.message, "UntagResource requires TagKeys");
  });

  it("refuses an ARN that names no DynamoDB table", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When the ARN belongs to another service.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().listTagsOfResource(
        new ListTagsOfResourceCommand({
          ResourceArn: `arn:aws:s3:::orders-bucket`,
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "is not a table ARN");
  });

  it("refuses an ARN naming another Account", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When the ARN names a table in another Account.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().listTagsOfResource(
        new ListTagsOfResourceCommand({
          ResourceArn:
            `arn:aws:dynamodb:${simAws.defaultRegionName}:` +
            `999999999999:table/OrdersTable`,
        }),
      ),
    );

    // Then it is refused rather than resolved to the local table of that name,
    // as the table commands refuse it.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(
      error.message,
      "names a table in another Account or Region",
    );
  });
});
