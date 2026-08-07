import {
  ListTagsOfResourceCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimDynamoDbTag } from "../table/table.types.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

/**
 * A tag key that sorts in the order the tags were made, so a page can be
 * asserted on.
 */
function numberedKey(index: number): string {
  return `Tag${index.toString().padStart(2, "0")}`;
}

describe("DynamoDB ListTagsOfResource paging", () => {
  it("pages at 25 tags and leaves the token off the last page", async () => {
    // Given a table holding 26 tags, which is one more than a page.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    await simDynamoDb.tagResource(
      new TagResourceCommand({
        ResourceArn: table.arn,
        Tags: Array.from({ length: 26 }, (_unused, index) => ({
          Key: numberedKey(index),
          Value: "test",
        })),
      }),
    );

    // When the first page is read.
    const first = await simDynamoDb.listTagsOfResource(
      new ListTagsOfResourceCommand({ ResourceArn: table.arn }),
    );

    // Then it carries a page of tags and the key to resume after.
    assertArrayLength(first.Tags, 25);
    assertIdentical(first.Tags[0].Key, "Tag00");
    assertIdentical(first.NextToken, "Tag24");

    // And the page after it carries the rest, with no token to follow.
    const second = await simDynamoDb.listTagsOfResource(
      new ListTagsOfResourceCommand({
        ResourceArn: table.arn,
        NextToken: first.NextToken,
      }),
    );
    assertArrayLength(second.Tags, 1);
    assertObjectEquals(second.Tags[0], { Key: "Tag25", Value: "test" });
    assertUndefined(second.NextToken);
  });

  it("reads every tag through a loop that follows the token", async () => {
    // Given a table holding 50 tags, which is as many as a resource holds.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    await simDynamoDb.tagResource(
      new TagResourceCommand({
        ResourceArn: table.arn,
        Tags: Array.from({ length: 50 }, (_unused, index) => ({
          Key: numberedKey(index),
          Value: "test",
        })),
      }),
    );

    // When a caller loops until the token is gone.
    const tags: SimDynamoDbTag[] = [];
    let nextToken: string | undefined;

    do {
      // A page can only be asked for once the one before it has answered with
      // its token, which is what a caller paging through tags does.
      // oxlint-disable-next-line no-await-in-loop
      const page = await simDynamoDb.listTagsOfResource(
        new ListTagsOfResourceCommand({
          ResourceArn: table.arn,
          NextToken: nextToken,
        }),
      );

      tags.push(...page.Tags);
      nextToken = page.NextToken;
    } while (nextToken !== undefined);

    // Then it read all of them, in key order, and the loop terminated.
    assertArrayLength(tags, 50);
    assertIdentical(tags[0].Key, "Tag00");
    assertIdentical(tags.at(-1)?.Key, "Tag49");
  });

  it("resumes from a token whose tag has since been removed", async () => {
    // Given a table holding 26 tags, and a token from its first page.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    await simDynamoDb.tagResource(
      new TagResourceCommand({
        ResourceArn: table.arn,
        Tags: Array.from({ length: 26 }, (_unused, index) => ({
          Key: numberedKey(index),
          Value: "test",
        })),
      }),
    );

    const first = await simDynamoDb.listTagsOfResource(
      new ListTagsOfResourceCommand({ ResourceArn: table.arn }),
    );
    const nextToken = first.NextToken;
    assertNonNullable(nextToken);

    // When the tag the token names is taken off before the next page is read.
    await simDynamoDb.untagResource(
      new UntagResourceCommand({
        ResourceArn: table.arn,
        TagKeys: [nextToken],
      }),
    );

    const second = await simDynamoDb.listTagsOfResource(
      new ListTagsOfResourceCommand({
        ResourceArn: table.arn,
        NextToken: nextToken,
      }),
    );

    // Then the page still resumes after it, since the token is a key rather
    // than a remembered position.
    assertArrayLength(second.Tags, 1);
    assertObjectEquals(second.Tags[0], { Key: "Tag25", Value: "test" });
  });

  it("lists tags in key order rather than the order they were applied", async () => {
    // Given a table tagged in an order of its own.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    await simDynamoDb.tagResource(
      new TagResourceCommand({
        ResourceArn: table.arn,
        Tags: [
          { Key: "Owner", Value: "platform" },
          { Key: "Environment", Value: "test" },
          { Key: "Application", Value: "ledger" },
        ],
      }),
    );

    // When the tags are listed.
    const output = await simDynamoDb.listTagsOfResource(
      new ListTagsOfResourceCommand({ ResourceArn: table.arn }),
    );

    // Then they come back ordered by key, which is one of the orders DynamoDB
    // allows and the one a page resumes through.
    assertArrayLength(output.Tags, 3);
    assertObjectEquals(output.Tags[0], { Key: "Application", Value: "ledger" });
    assertObjectEquals(output.Tags[1], { Key: "Environment", Value: "test" });
    assertObjectEquals(output.Tags[2], { Key: "Owner", Value: "platform" });
  });
});
