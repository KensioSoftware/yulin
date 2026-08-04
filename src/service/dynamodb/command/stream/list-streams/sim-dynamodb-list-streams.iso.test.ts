import {
  CreateTableCommand,
  UpdateTableCommand,
} from "@aws-sdk/client-dynamodb";
import { ListStreamsCommand } from "@aws-sdk/client-dynamodb-streams";
import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../../iam/error/sim-iam.error.js";
import { SimDynamoDbValidationException } from "../../../error/dynamodb.error.js";
import { simDynamoDbStreamedTableFactory } from "../../../stream/sim-dynamodb-streamed-table.factory.js";

/**
 * Create a table with no stream on it at all.
 */
async function createPlainTable(
  simAws: SimAws,
  tableName: string,
): Promise<void> {
  await simAws.dynamoDb().createTable(
    new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simAws.backgroundTasksComplete();
}

describe("DynamoDB Streams ListStreams", () => {
  it("reports a streamed table's stream", async () => {
    // Given a table with a stream switched on.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);

    // When the streams of that table are listed.
    const output = await simAws
      .dynamoDbStreams()
      .listStreams(new ListStreamsCommand({ TableName: "orders" }));

    // Then the stream the table is capturing onto is the one reported.
    assertArrayLength(output.Streams, 1);
    assertIdentical(output.Streams[0].StreamArn, table.stream.latest?.arn);
    assertIdentical(output.Streams[0].TableName, "orders");
    assertIdentical(output.Streams[0].StreamLabel, table.stream.latest?.label);
  });

  it("reports nothing for a table with no stream", async () => {
    // Given one streamed table and one without a stream.
    const simAws = new SimAws();
    await simDynamoDbStreamedTableFactory.make({}, simAws);
    await createPlainTable(simAws, "invoices");

    // When the streams of the table with no stream are listed.
    const output = await simAws
      .dynamoDbStreams()
      .listStreams(new ListStreamsCommand({ TableName: "invoices" }));

    // Then it has none, rather than the table being reported as missing.
    assertArrayLength(output.Streams, 0);
  });

  it("goes on listing a stream its table has switched off", async () => {
    // Given a table whose stream has been disabled.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);
    const disabledArn = table.stream.latest?.arn;

    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        StreamSpecification: { StreamEnabled: false },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the table's streams are listed.
    const output = await simAws
      .dynamoDbStreams()
      .listStreams(new ListStreamsCommand({ TableName: "orders" }));

    // Then the disabled stream is still there to be read within its retention
    // window.
    assertArrayLength(output.Streams, 1);
    assertIdentical(output.Streams[0].StreamArn, disabledArn);
  });

  it("pages by stream ARN", async () => {
    // Given two tables, each with a stream.
    const simAws = new SimAws();
    await simDynamoDbStreamedTableFactory.make({ tableName: "alpha" }, simAws);
    await simDynamoDbStreamedTableFactory.make({ tableName: "beta" }, simAws);

    // When a page of one stream is asked for.
    const first = await simAws
      .dynamoDbStreams()
      .listStreams(new ListStreamsCommand({ Limit: 1 }));

    // Then the page carries the ARN to resume from.
    assertArrayLength(first.Streams, 1);
    assertIdentical(first.LastEvaluatedStreamArn, first.Streams[0].StreamArn);

    // And resuming from it gives the other stream, and no token to go on with.
    const second = await simAws.dynamoDbStreams().listStreams(
      new ListStreamsCommand({
        Limit: 1,
        ExclusiveStartStreamArn: first.LastEvaluatedStreamArn,
      }),
    );

    assertArrayLength(second.Streams, 1);
    assertIdentical(second.Streams[0].TableName, "beta");
    assertUndefined(second.LastEvaluatedStreamArn);
  });

  it("refuses a Limit above the page size cap", async () => {
    // Given a table with a stream.
    const simAws = new SimAws();
    await simDynamoDbStreamedTableFactory.make({}, simAws);

    // When more streams than one page holds are asked for at once.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .dynamoDbStreams()
        .listStreams(new ListStreamsCommand({ Limit: 0 })),
    );

    // Then the request is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
  });

  it("denies a caller without dynamodb:ListStreams", async () => {
    // Given a Role with no DynamoDB permissions at all.
    const simAws = new SimAws();
    await simDynamoDbStreamedTableFactory.make({}, simAws);

    const roleCreation = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "NoStreamsRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    // When that Role lists streams.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDbStreams().listStreams(new ListStreamsCommand({}), {
        caller: { kind: "arn", arn: roleCreation.Role.Arn },
      }),
    );

    // Then it is refused rather than given an empty listing, since the action
    // names no particular stream.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:ListStreams");
    assertIdentical(error.resource, "*");
  });
});
