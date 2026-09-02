import { setTimeout } from "node:timers";
import { describe, it } from "vitest";
import {
  assertArrayIncludes,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import {
  CreateStackCommand,
  DescribeStacksCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import { GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCloudFormation } from "../../sim-cloudformation.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";

describe("simulated CloudFormation Stack update rollback", () => {
  /**
   * A Stack of one named Bucket, with an Output reading the name back.
   */
  function reportsTemplate(properties: {
    readonly bucketName: string;
    readonly attributes: Record<string, string>;
  }): string {
    return jsonStringify({
      Resources: {
        ReportsBucket: {
          Type: "AWS::S3::Bucket",
          ...properties.attributes,
          Properties: { BucketName: properties.bucketName },
        },
      },
      Outputs: { BucketName: { Value: { Ref: "ReportsBucket" } } },
    });
  }

  /**
   * A Bucket S3 will not create, which is what fails these updates once they
   * have already changed something.
   */
  const unbuildableBucket = {
    Type: "AWS::S3::Bucket",
    Properties: { BucketName: "Invalid_Archive_Name" },
  };

  /**
   * The same Stack, with that Bucket alongside, so the update gets as far as
   * replacing the first Bucket and then fails.
   */
  function unbuildableTemplate(properties: {
    readonly bucketName: string;
    readonly attributes?: Record<string, string> | undefined;
  }): string {
    return jsonStringify({
      Resources: {
        ReportsBucket: {
          Type: "AWS::S3::Bucket",
          ...properties.attributes,
          Properties: { BucketName: properties.bucketName },
        },
        ArchiveBucket: unbuildableBucket,
      },
      Outputs: { BucketName: { Value: { Ref: "ReportsBucket" } } },
    });
  }

  /**
   * A Stack of one named Table, alongside whatever else the case needs.
   */
  function ordersTemplate(
    tableName: string,
    otherResources: Record<string, unknown> = {},
  ): string {
    return jsonStringify({
      Resources: {
        OrdersTable: {
          Type: "AWS::DynamoDB::Table",
          Properties: {
            TableName: tableName,
            KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
            AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
            BillingMode: "PAY_PER_REQUEST",
          },
        },
        ...otherResources,
      },
    });
  }

  async function deployReportsStack(
    simAws: SimAws,
    attributes: Record<string, string> = {},
  ): Promise<void> {
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "reports-stack",
        TemplateBody: reportsTemplate({
          bucketName: "reports-first",
          attributes,
        }),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("reports-stack");
  }

  /**
   * Every Stack status DescribeStacks reports while the update settles.
   *
   * The rollback is scheduled as an operation of its own, so the Stack is
   * visibly in UPDATE_ROLLBACK_IN_PROGRESS between the update failing and the
   * rollback running. Reading the status each turn of the event loop is how a
   * test sees that, the way a caller polling DescribeStacks does.
   */
  async function statusesWhileUpdating(
    cloudFormation: SimCloudFormation,
  ): Promise<readonly string[]> {
    const settled = assertThrowsErrorAsync(async () =>
      cloudFormation.waitForStackUpdateComplete("reports-stack"),
    );
    const seen: string[] = [];

    // The update is one scheduled operation and the rollback is another, so a
    // handful of turns of the event loop covers both.
    for (let turn = 0; turn < 20; turn++) {
      // oxlint-disable-next-line no-await-in-loop -- one turn at a time is the point.
      const described = await cloudFormation.describeStacks(
        new DescribeStacksCommand({ StackName: "reports-stack" }),
      );

      seen.push(described.Stacks?.[0]?.StackStatus ?? "");

      // oxlint-disable-next-line no-await-in-loop -- one turn at a time is the point.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }

    await settled;

    return seen;
  }

  it("puts the Stack back on the template it was deployed from", async () => {
    // Given a deployed Stack, and an update that replaces its Bucket and then
    // asks for one S3 will not create.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);

    // When the update fails part way through.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        TemplateBody: unbuildableTemplate({ bucketName: "reports-second" }),
      }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.waitForStackUpdateComplete("reports-stack"),
    );

    // Then the caller is still told what stopped it.
    assertStringIncludes(error.message, "ArchiveBucket");

    // And the Stack settles holding the Resources its previous template
    // describes, with the Output resolved against them again.
    const stack = cloudFormation.getStackByName("reports-stack");
    assertNonNullable(stack);
    assertIdentical(stack.status, "UPDATE_ROLLBACK_COMPLETE");
    assertIdentical(stack.output("BucketName"), "reports-first");
    assertNonNullable(simAws.s3().getSimBucketByName("reports-first"));
    assertUndefined(simAws.s3().getSimBucketByName("reports-second"));
    assertUndefined(simAws.s3().getSimBucketByName("Invalid_Archive_Name"));
  });

  it("reports the rollback statuses while the update settles", async () => {
    // Given a deployed Stack and an update that will fail part way through.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        TemplateBody: unbuildableTemplate({ bucketName: "reports-second" }),
      }),
    );

    // When DescribeStacks is polled until the Stack settles.
    const seen = await statusesWhileUpdating(cloudFormation);

    // Then it reports the rollback running and then finished, the way it
    // reported the update running before that.
    assertArrayIncludes(seen, "UPDATE_IN_PROGRESS");
    assertArrayIncludes(seen, "UPDATE_ROLLBACK_IN_PROGRESS");
    assertIdentical(
      cloudFormation.getStackByName("reports-stack")?.status,
      "UPDATE_ROLLBACK_COMPLETE",
    );
  });

  it("brings a replaced Resource back empty", async () => {
    // Given a deployed Table holding an item. A Table is replaced by deleting
    // it and creating one under the new name, so the item goes with it.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "orders-stack",
        TemplateBody: ordersTemplate("orders-first"),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("orders-stack");
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders-first",
        Item: { id: { S: "order-1" } },
      }),
    );

    // When an update renames the Table and then asks for a Bucket S3 will not
    // create, so the Stack is rolled back after the Table has been replaced.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "orders-stack",
        TemplateBody: ordersTemplate("orders-second", {
          ArchiveBucket: unbuildableBucket,
        }),
      }),
    );
    await assertThrowsErrorAsync(async () =>
      cloudFormation.waitForStackUpdateComplete("orders-stack"),
    );

    // Then the Table the previous template describes is back, and empty: the
    // deployed one was deleted before the replacement was attempted.
    assertIdentical(
      cloudFormation.getStackByName("orders-stack")?.status,
      "UPDATE_ROLLBACK_COMPLETE",
    );

    const item = await simAws.dynamoDb().getItem(
      new GetItemCommand({
        TableName: "orders-first",
        Key: { id: { S: "order-1" } },
      }),
    );

    assertUndefined(item.Item);
  });

  it("fails the rollback when a kept Resource still holds the name", async () => {
    // Given a deployed Bucket the template says to keep when it is replaced,
    // so the failed update leaves it in simulated S3 under its own name.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws, { UpdateReplacePolicy: "Retain" });

    // When the update fails and the rollback tries to create the kept Bucket
    // again, which S3 refuses because the kept one is still there.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        TemplateBody: unbuildableTemplate({
          bucketName: "reports-second",
          attributes: { UpdateReplacePolicy: "Retain" },
        }),
      }),
    );
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.waitForStackUpdateComplete("reports-stack"),
    );

    // Then the caller is told what stopped the update, which is the failure
    // they asked for. The rollback's own failure is on the Stack.
    assertStringIncludes(error.message, "ArchiveBucket");

    // And the Stack is left in UPDATE_ROLLBACK_FAILED, saying why the rollback
    // could not finish.
    const described = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: "reports-stack" }),
    );
    const [describedStack] = described.Stacks ?? [];

    assertNonNullable(describedStack);
    assertIdentical(describedStack.StackStatus, "UPDATE_ROLLBACK_FAILED");
    assertStringIncludes(
      describedStack.StackStatusReason ?? "",
      "already exists",
    );

    // And both kept Buckets are still in simulated S3, the rollback having
    // read UpdateReplacePolicy the same way the update did.
    assertNonNullable(simAws.s3().getSimBucketByName("reports-first"));
    assertNonNullable(simAws.s3().getSimBucketByName("reports-second"));
  });
});
