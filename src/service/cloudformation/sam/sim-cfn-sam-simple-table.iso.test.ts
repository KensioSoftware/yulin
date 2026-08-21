import {
  DescribeTableCommand,
  GetItemCommand,
  ListTagsOfResourceCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimDynamoDbTableDescription } from "../../dynamodb/command/table/table.types.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import type { SimCfnDeployedStack } from "../stack/sim-cfn-deployed-stack.type.js";
import {
  samSimpleTableTemplateLogicalId,
  samSimpleTableTemplateTableName,
  simCfnSamSimpleTableTemplateFactory,
} from "./table/sim-cfn-sam-simple-table-template.factory.js";

/**
 * Deploy a SAM template and wait for the table it holds to become ACTIVE, the
 * way a table an SDK caller created becomes ACTIVE in the background.
 */
async function deploySimpleTable(
  simAws: SimAws,
  template: CfnTemplateBodyRecord,
): Promise<SimCfnDeployedStack> {
  const stack = await simAws
    .cloudFormation()
    .deployTemplate({ stackName: "rates-stack", template });
  await stack.waitForDeployComplete();
  await simAws.backgroundTasksComplete();

  return stack;
}

/**
 * The table the template deployed, described the way an SDK caller's table is,
 * so a wrong value in the template is a wrong value here.
 */
async function describeTable(
  simAws: SimAws,
): Promise<SimDynamoDbTableDescription> {
  const described = await simAws.dynamoDb().describeTable(
    new DescribeTableCommand({
      TableName: samSimpleTableTemplateTableName,
    }),
  );
  assertNonNullable(described.Table);

  return described.Table;
}

describe("SAM Serverless SimpleTable expansion", () => {
  it("deploys a SAM simple table as a table keyed the way it named", async () => {
    // Given a SAM template declaring one table with a primary key of its own
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deploySimpleTable(
      simAws,
      simCfnSamSimpleTableTemplateFactory.make({
        tableProperties: { PrimaryKey: { Name: "currency", Type: "String" } },
      }),
    );

    // Then the SAM logical ID is a simulated DynamoDB table
    const tableResource = stack.getResource("Rates");
    assertNonNullable(tableResource);
    assertIdentical(tableResource.type, "AWS::DynamoDB::Table");
    assertArrayLength(stack.skippedResources, 0);

    // And the key it named is the table's partition key, billed on demand
    const table = await describeTable(simAws);

    assertObjectEquals(table.KeySchema, [
      { AttributeName: "currency", KeyType: "HASH" },
    ]);
    assertObjectEquals(table.AttributeDefinitions, [
      { AttributeName: "currency", AttributeType: "S" },
    ]);
    assertIdentical(table.BillingModeSummary?.BillingMode, "PAY_PER_REQUEST");

    // And the table holds the items written to the key it was given
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: samSimpleTableTemplateTableName,
        Item: { currency: { S: "GBP" }, rate: { N: "1" } },
      }),
    );
    const item = await simAws.dynamoDb().getItem(
      new GetItemCommand({
        TableName: samSimpleTableTemplateTableName,
        Key: { currency: { S: "GBP" } },
      }),
    );

    assertIdentical(item.Item?.["rate"]?.N, "1");
  });

  it("answers Ref and Fn::GetAtt against the SAM logical ID", async () => {
    // Given a SAM template outputting what its table's logical ID resolves to
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deploySimpleTable(
      simAws,
      simCfnSamSimpleTableTemplateFactory.make(),
    );

    // Then both answer for the table the SAM Resource was expanded into
    assertIdentical(
      stack.outputs.get("TableName")?.value,
      samSimpleTableTemplateTableName,
    );
    assertIdentical(
      stack.outputs.get("TableArn")?.value,
      `arn:aws:dynamodb:${simAws.defaultRegionName}:` +
        `${simAws.defaultAccountId}:table/${samSimpleTableTemplateTableName}`,
    );
  });

  it("gives a table naming no key the one SAM gives it", async () => {
    // Given a SAM table stating no primary key, which SAM keys on a string id
    const simAws = new SimAws();

    // When it is deployed
    await deploySimpleTable(simAws, simCfnSamSimpleTableTemplateFactory.make());

    // Then the table is keyed on that id
    const table = await describeTable(simAws);

    assertObjectEquals(table.KeySchema, [
      { AttributeName: "id", KeyType: "HASH" },
    ]);
    assertObjectEquals(table.AttributeDefinitions, [
      { AttributeName: "id", AttributeType: "S" },
    ]);
  });

  it("keys a table on the number attribute type SAM names", async () => {
    // Given a table keyed on a number, which SAM names differently from the
    // way DynamoDB names it
    const simAws = new SimAws();

    // When it is deployed
    await deploySimpleTable(
      simAws,
      simCfnSamSimpleTableTemplateFactory.make({
        tableProperties: { PrimaryKey: { Name: "sequence", Type: "Number" } },
      }),
    );

    // Then the attribute is defined as the type DynamoDB calls it
    const table = await describeTable(simAws);

    assertObjectEquals(table.AttributeDefinitions, [
      { AttributeName: "sequence", AttributeType: "N" },
    ]);
  });

  it("provisions the capacity a simple table asks for", async () => {
    // Given a table asking for capacity rather than taking on-demand billing
    const simAws = new SimAws();

    // When it is deployed
    await deploySimpleTable(
      simAws,
      simCfnSamSimpleTableTemplateFactory.make({
        tableProperties: {
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 3,
          },
        },
      }),
    );

    // Then the table is provisioned with it rather than billed on demand
    const table = await describeTable(simAws);

    const throughput = table.ProvisionedThroughput;
    assertNonNullable(throughput);
    assertIdentical(throughput.ReadCapacityUnits, 5);
    assertIdentical(throughput.WriteCapacityUnits, 3);
  });

  it("tags the table with the tags SAM states as a map", async () => {
    // Given a table tagged the way a SAM template tags one
    const simAws = new SimAws();

    // When it is deployed
    await deploySimpleTable(
      simAws,
      simCfnSamSimpleTableTemplateFactory.make({
        tableProperties: { Tags: { Environment: "test", Owner: "platform" } },
      }),
    );

    // Then the tags are on the table an SDK caller reads
    const table = await describeTable(simAws);
    assertNonNullable(table.TableArn);

    const tags = await simAws
      .dynamoDb()
      .listTagsOfResource(
        new ListTagsOfResourceCommand({ ResourceArn: table.TableArn }),
      );

    assertArrayLength(tags.Tags, 2);
    assertObjectEquals(tags.Tags[0], { Key: "Environment", Value: "test" });
    assertObjectEquals(tags.Tags[1], { Key: "Owner", Value: "platform" });
  });

  it("keys a table on a string where the key names no type", async () => {
    // Given a primary key naming an attribute and no type for it
    const simAws = new SimAws();

    // When it is deployed
    await deploySimpleTable(
      simAws,
      simCfnSamSimpleTableTemplateFactory.make({
        tableProperties: { PrimaryKey: { Name: "currency" } },
      }),
    );

    // Then the attribute is defined as the string SAM defaults it to
    const table = await describeTable(simAws);

    assertObjectEquals(table.AttributeDefinitions, [
      { AttributeName: "currency", AttributeType: "S" },
    ]);
  });

  it("tags the table with the tags SAM states as a list", async () => {
    // Given a table tagged the way a CloudFormation template tags one, which
    // SAM carries through as it was written
    const simAws = new SimAws();

    // When it is deployed
    await deploySimpleTable(
      simAws,
      simCfnSamSimpleTableTemplateFactory.make({
        tableProperties: { Tags: [{ Key: "Environment", Value: "test" }] },
      }),
    );

    // Then the tags are on the table an SDK caller reads
    const table = await describeTable(simAws);
    assertNonNullable(table.TableArn);

    const tags = await simAws
      .dynamoDb()
      .listTagsOfResource(
        new ListTagsOfResourceCommand({ ResourceArn: table.TableArn }),
      );

    assertArrayLength(tags.Tags, 1);
    assertObjectEquals(tags.Tags[0], { Key: "Environment", Value: "test" });
  });

  it("refuses a key type CreateTable has no such attribute type for", async () => {
    // Given a primary key naming a type neither SAM nor DynamoDB knows
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails
    const error = await assertThrowsErrorAsync(async () => {
      return await deploySimpleTable(
        simAws,
        simCfnSamSimpleTableTemplateFactory.make({
          tableProperties: { PrimaryKey: { Name: "currency", Type: "Text" } },
        }),
      );
    });

    // And the failure is the one CreateTable gives, because the type was
    // carried across for CreateTable to answer for
    assertStringIncludes(error.message, "Text");
  });

  it("carries the point in time recovery the table asks for", async () => {
    // Given a table asking for point in time recovery, which SAM passes to the
    // DynamoDB table and this simulation has no answer for
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deploySimpleTable(
      simAws,
      simCfnSamSimpleTableTemplateFactory.make({
        tableProperties: {
          PointInTimeRecoverySpecification: {
            PointInTimeRecoveryEnabled: true,
          },
        },
      }),
    );

    // Then the table was created, and the property it was created without is
    // recorded against it under the DynamoDB Resource type
    assertArrayLength(stack.ignoredProperties, 1);
    const ignored = stack.ignoredProperties[0];
    assertNonNullable(ignored);
    assertIdentical(ignored.logicalId, samSimpleTableTemplateLogicalId);
    assertStringIncludes(
      ignored.reason,
      "PointInTimeRecoverySpecification is a real AWS::DynamoDB::Table " +
        "property that simulated DynamoDB does not simulate",
    );
  });
});
