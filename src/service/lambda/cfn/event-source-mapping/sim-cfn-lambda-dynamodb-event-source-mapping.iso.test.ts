import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { ListEventSourceMappingsCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLambdaDynamoDbStreamEvent } from "../../event-source/poll/sim-lambda-dynamodb-stream-event.types.js";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

/**
 * The mapping a default `DynamoEventSource` emits: the stream ARN, the
 * function, the batch size CDK always states, and a starting position.
 */
const mappingProperties: SimCfnTemplateValueRecord = {
  EventSourceArn: { "Fn::GetAtt": ["OrdersTable", "StreamArn"] },
  FunctionName: { Ref: "ProjectorFunction" },
  BatchSize: 100,
  StartingPosition: "TRIM_HORIZON",
};

/**
 * A template with a streamed table, a projector function whose role may read
 * the stream, and a mapping between them.
 *
 * The role's grant is split the way CDK's own `grantStreamRead` splits it: the
 * three stream operations on the stream ARN, and `ListStreams` on every stream.
 */
function projectorTemplate(
  properties: SimCfnTemplateValueRecord,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      OrdersTable: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          TableName: "orders",
          KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
          AttributeDefinitions: [
            { AttributeName: "orderId", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
          StreamSpecification: { StreamViewType: "NEW_AND_OLD_IMAGES" },
        },
      },
      OrderQueue: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "orders" },
      },
      ProjectorRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "OrderProjectorRole",
          AssumeRolePolicyDocument: assumeRolePolicyDocument,
          Policies: [
            {
              PolicyName: "ReadOrdersStream",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: [
                      "dynamodb:DescribeStream",
                      "dynamodb:GetRecords",
                      "dynamodb:GetShardIterator",
                    ],
                    Resource: { "Fn::GetAtt": ["OrdersTable", "StreamArn"] },
                  },
                  {
                    Effect: "Allow",
                    Action: "dynamodb:ListStreams",
                    Resource: "*",
                  },
                  {
                    Effect: "Allow",
                    Action: [
                      "sqs:ReceiveMessage",
                      "sqs:DeleteMessage",
                      "sqs:GetQueueAttributes",
                    ],
                    Resource: { "Fn::GetAtt": ["OrderQueue", "Arn"] },
                  },
                ],
              },
            },
          ],
        },
      },
      ProjectorFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "order-projector",
          Role: { "Fn::GetAtt": ["ProjectorRole", "Arn"] },
        },
      },
      OrderProjectorMapping: {
        Type: "AWS::Lambda::EventSourceMapping",
        Properties: properties,
      },
    },
  };
}

/**
 * Deploy the projector template, answering with what the function was given.
 */
async function deployProjector(
  properties: SimCfnTemplateValueRecord,
): Promise<readonly SimLambdaDynamoDbStreamEvent[]> {
  const simAws = new SimAws();
  const events: SimLambdaDynamoDbStreamEvent[] = [];

  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders-stack",
    template: projectorTemplate(properties),
    bindings: [
      {
        logicalId: "ProjectorFunction",
        handler: (event: SimLambdaDynamoDbStreamEvent): undefined => {
          events.push(event);

          return undefined;
        },
      },
    ],
  });
  await stack.waitForDeployComplete();

  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "orders",
      Item: { orderId: { S: "order-1" }, total: { N: "101" } },
    }),
  );
  await simAws.backgroundTasksComplete();

  return events;
}

/**
 * The error the projector template is refused with.
 */
async function projectorDeployError(
  properties: SimCfnTemplateValueRecord,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await deployProjector(properties);
  });
}

describe("Lambda CloudFormation DynamoDB stream event source mapping", () => {
  it("deploys a mapping that delivers a table's changes to a function", async () => {
    // Given a template with a streamed table, a function and a mapping between
    // them, as CDK's DynamoEventSource emits.

    // When the template is deployed and an item is written to the table.
    const events = await deployProjector(mappingProperties);

    // Then the write reached the deployed function as a stream event.
    assertArrayLength(events, 1);

    const record = events[0].Records[0];
    assertNonNullable(record);
    assertIdentical(record.eventName, "INSERT");
    assertIdentical(record.dynamodb.NewImage?.["total"]?.N, "101");
  });

  it("deploys a mapping with the failed-batch limits the template states", async () => {
    // Given a template stating a retry quota and a record age on the mapping.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: projectorTemplate({
        ...mappingProperties,
        MaximumRetryAttempts: 2,
        MaximumRecordAgeInSeconds: 300,
      }),
      bindings: [
        {
          logicalId: "ProjectorFunction",
          handler: (): undefined => undefined,
        },
      ],
    });
    await stack.waitForDeployComplete();

    // When the mappings of the deployed function are listed.
    const listed = await simAws
      .lambda()
      .listEventSourceMappings(
        new ListEventSourceMappingsCommand({ FunctionName: "order-projector" }),
      );

    // Then the mapping keeps both, rather than the no-limit defaults a mapping
    // stating neither of them gets.
    assertArrayLength(listed.EventSourceMappings, 1);
    assertIdentical(listed.EventSourceMappings[0].MaximumRetryAttempts, 2);
    assertIdentical(
      listed.EventSourceMappings[0].MaximumRecordAgeInSeconds,
      300,
    );
  });

  it("refuses a failed-batch limit outside the range Lambda takes", async () => {
    // Given a template asking for more retries than Lambda's maximum.
    const error = await projectorDeployError({
      ...mappingProperties,
      MaximumRetryAttempts: 10_001,
    });

    // Then the Resource fails the stack, in the words CreateEventSourceMapping
    // refuses an SDK caller in, rather than being skipped as unsupported.
    assertStringIncludes(error.message, "maximumRetryAttempts");
  });

  it("refuses a stream mapping with no StartingPosition", async () => {
    // Given a template leaving out the position a stream mapping starts from,
    // which real Lambda requires.

    // When the template is deployed, then it fails in the words
    // CreateEventSourceMapping refuses an SDK caller in.
    const error = await projectorDeployError({
      EventSourceArn: { "Fn::GetAtt": ["OrdersTable", "StreamArn"] },
      FunctionName: { Ref: "ProjectorFunction" },
      BatchSize: 100,
    });

    assertStringIncludes(
      error.message,
      "StartingPosition is required for a DynamoDB stream event source mapping",
    );
  });

  it("refuses StartingPosition on a queue mapping", async () => {
    // Given a template naming a starting position for a queue, which has
    // nowhere but the front of the queue to start from.
    const error = await projectorDeployError({
      ...mappingProperties,
      EventSourceArn: { "Fn::GetAtt": ["OrderQueue", "Arn"] },
      BatchSize: 10,
    });

    // Then the mapping is refused rather than deployed ignoring it.
    assertStringIncludes(
      error.message,
      "StartingPosition is not valid for a queue",
    );
  });

  it("refuses StartingPositionTimestamp by name", async () => {
    // Given a template asking to start at an instant, which is for a Kinesis
    // stream read with AT_TIMESTAMP.
    const error = await projectorDeployError({
      ...mappingProperties,
      StartingPositionTimestamp: 1_767_225_600,
    });

    // Then the refusal names the property.
    assertStringIncludes(
      error.message,
      "StartingPositionTimestamp only goes with the StartingPosition " +
        "AT_TIMESTAMP",
    );
  });

  it("refuses a StartingPositionTimestamp that is not a number", async () => {
    // Given a template carrying the timestamp as text, where CloudFormation
    // takes Unix time seconds.
    const error = await projectorDeployError({
      ...mappingProperties,
      StartingPositionTimestamp: "2026-01-01T00:00:00Z",
    });

    // Then the refusal names the property and what it should have been.
    assertStringIncludes(
      error.message,
      "StartingPositionTimestamp must be a number",
    );
  });
});
