import { DescribeTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  DescribeStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  ListStreamsCommand,
} from "@aws-sdk/client-dynamodb-streams";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimDynamoDbStreamsRecord } from "../command/stream/stream.types.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnStack } from "../../cloudformation/stack/sim-cfn-stack.js";
import { simCfnDynamoDbTableResourceFactory } from "./table/sim-cfn-dynamodb-table-resource.factory.js";

/**
 * Deploy a table Resource carrying the properties a test is about.
 *
 * The Outputs are stated per test rather than always, since a table that was
 * skipped or failed has no stream ARN for an Output to take.
 */
async function deployTable(
  simAws: SimAws,
  properties: SimCfnTemplateValueRecord,
  outputs: SimCfnTemplateValueRecord = {},
): Promise<SimCfnStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders-stack",
    template: {
      Resources: {
        OrdersTable: simCfnDynamoDbTableResourceFactory.make({
          tableName: "orders",
          partitionKeyName: "orderId",
          properties,
        }),
      },
      Outputs: outputs,
    },
  });
  await stack.waitForDeployComplete();
  await simAws.backgroundTasksComplete();

  return stack;
}

/**
 * The Output a template declaring a stream goes on to use.
 */
const streamArnOutputs: SimCfnTemplateValueRecord = {
  OrdersStreamArn: { Value: { "Fn::GetAtt": ["OrdersTable", "StreamArn"] } },
};

/**
 * The records the table's stream holds, read the way a consumer reads them.
 */
async function readOrderRecords(
  simAws: SimAws,
): Promise<readonly SimDynamoDbStreamsRecord[]> {
  const dynamoDbStreams = simAws.dynamoDbStreams();

  const listed = await dynamoDbStreams.listStreams(
    new ListStreamsCommand({ TableName: "orders" }),
  );
  const streamArn = listed.Streams?.[0]?.StreamArn;

  const described = await dynamoDbStreams.describeStream(
    new DescribeStreamCommand({ StreamArn: streamArn }),
  );
  const iterator = await dynamoDbStreams.getShardIterator(
    new GetShardIteratorCommand({
      StreamArn: streamArn,
      ShardId: described.StreamDescription?.Shards?.[0]?.ShardId,
      ShardIteratorType: "TRIM_HORIZON",
    }),
  );

  const read = await dynamoDbStreams.getRecords(
    new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
  );

  return read.Records ?? [];
}

describe("DynamoDB CloudFormation Table stream", () => {
  it("deploys a table that captures its changes on a stream", async () => {
    // Given a template declaring a stream on its table, which CloudFormation
    // states as a view type with no StreamEnabled of its own.
    const simAws = new SimAws();

    // When the template is deployed.
    await deployTable(simAws, {
      StreamSpecification: { StreamViewType: "NEW_AND_OLD_IMAGES" },
    });

    // Then the table reports the stream, as it would for an SDK caller.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));
    assertNonNullable(described.Table?.StreamSpecification);
    assertTrue(described.Table.StreamSpecification.StreamEnabled);
    assertIdentical(
      described.Table.StreamSpecification.StreamViewType,
      "NEW_AND_OLD_IMAGES",
    );

    // And a write to the deployed table is captured on the stream.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: { orderId: { S: "order-1" }, total: { N: "101" } },
      }),
    );

    const records = await readOrderRecords(simAws);
    assertArrayLength(records, 1);

    const record = records[0];
    assertNonNullable(record);
    assertIdentical(record.eventName, "INSERT");
    assertIdentical(record.dynamodb?.NewImage?.["total"]?.N, "101");
  });

  it("resolves Fn::GetAtt StreamArn to the stream ARN", async () => {
    // Given a template handing its table's stream ARN to an Output, which is
    // what an event source mapping takes.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await deployTable(
      simAws,
      { StreamSpecification: { StreamViewType: "KEYS_ONLY" } },
      streamArnOutputs,
    );

    // Then the Output holds the ARN the table reports as its latest stream,
    // rather than a stand-in nothing is publishing to.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));
    assertNonNullable(described.Table?.LatestStreamArn);
    assertIdentical(
      stack.outputs.get("OrdersStreamArn")?.value,
      described.Table.LatestStreamArn,
    );
  });

  it("fails a table whose StreamSpecification names no view type", async () => {
    // Given a template declaring a stream without saying which images its
    // records carry, which real CloudFormation requires.
    const simAws = new SimAws();

    // When the template is deployed, then it fails in the words CreateTable
    // refuses an SDK caller in.
    const error = await assertThrowsErrorAsync(async () => {
      await deployTable(simAws, { StreamSpecification: {} });
    });

    assertStringIncludes(
      error.message,
      "StreamViewType is required when StreamEnabled is true",
    );
    assertUndefined(simAws.dynamoDb().findTable("orders"));
  });

  it("skips a table publishing its changes to a Kinesis stream", async () => {
    // Given a template asking for a Kinesis stream, which is a different thing
    // from the table's own stream and is not simulated.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await deployTable(simAws, {
      KinesisStreamSpecification: {
        StreamArn: "arn:aws:kinesis:eu-west-2:111111111111:stream/orders",
      },
    });

    // Then the table is skipped, naming the property, rather than deployed
    // publishing its changes nowhere.
    const resource = stack.getResource("OrdersTable");
    assertNonNullable(resource);
    assertTrue(resource.skipped);
    assertStringIncludes(
      resource.skippedReason ?? "",
      "KinesisStreamSpecification is a real AWS::DynamoDB::Table property " +
        "that simulated DynamoDB does not simulate",
    );
    assertUndefined(simAws.dynamoDb().findTable("orders"));
  });

  it("skips a table asking for a policy on its stream", async () => {
    // Given a template putting a resource policy on the stream, which is a
    // different property from the table's own ResourcePolicy.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await deployTable(simAws, {
      StreamSpecification: {
        StreamViewType: "NEW_IMAGE",
        ResourcePolicy: { PolicyDocument: { Version: "2012-10-17" } },
      },
    });

    // Then the table is skipped, naming the whole path to the property, rather
    // than deployed with a stream anything could read.
    const resource = stack.getResource("OrdersTable");
    assertNonNullable(resource);
    assertTrue(resource.skipped);
    assertStringIncludes(
      resource.skippedReason ?? "",
      "StreamSpecification.ResourcePolicy is a real AWS::DynamoDB::Table " +
        "property that simulated DynamoDB does not simulate",
    );
    assertUndefined(simAws.dynamoDb().findTable("orders"));
  });

  it("fails a table whose StreamSpecification has a made up property", async () => {
    // Given a template stating something StreamSpecification has no such thing
    // as, which real CloudFormation would refuse too.
    const simAws = new SimAws();

    // When the template is deployed, then the failure names the property path.
    const error = await assertThrowsErrorAsync(async () => {
      await deployTable(simAws, {
        StreamSpecification: {
          StreamViewType: "NEW_IMAGE",
          StreamEnabled: true,
        },
      });
    });

    assertStringIncludes(
      error.message,
      "StreamSpecification.StreamEnabled is not an AWS::DynamoDB::Table " +
        "StreamSpecification property",
    );
  });
});
