import { PutRecordCommand } from "@aws-sdk/client-kinesis";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimLambdaKinesisStreamEvent } from "../../event-source/poll/kinesis/sim-lambda-kinesis-stream-event.types.js";

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
 * A template with a stream, a projector function whose role may read it, and a
 * mapping between them.
 *
 * This is the shape a CDK `KinesisEventSource` synthesizes: the mapping and the
 * grant both reach the stream by `Fn::GetAtt`, and that reference is also what
 * makes them wait for it.
 *
 * The role's grant is split the way CDK's own `grantRead` splits it: the three
 * stream operations on the stream ARN, and `ListStreams` on every stream.
 */
function projectorTemplate(): CfnTemplateBodyRecord {
  return {
    Resources: {
      OrdersStream: {
        Type: "AWS::Kinesis::Stream",
        Properties: { Name: "orders", ShardCount: 2 },
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
                      "kinesis:DescribeStream",
                      "kinesis:GetRecords",
                      "kinesis:GetShardIterator",
                    ],
                    Resource: { "Fn::GetAtt": ["OrdersStream", "Arn"] },
                  },
                  {
                    Effect: "Allow",
                    Action: "kinesis:ListStreams",
                    Resource: "*",
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
        Properties: {
          EventSourceArn: { "Fn::GetAtt": ["OrdersStream", "Arn"] },
          FunctionName: { Ref: "ProjectorFunction" },
          BatchSize: 100,
          StartingPosition: "TRIM_HORIZON",
        },
      },
    },
  };
}

describe("deployed Kinesis stream event source mappings", () => {
  it("polls the stream a deployed mapping names", async () => {
    // Given a stack declaring a stream and mapping it to a projector function.
    const simAws = new SimAws();
    const events: SimLambdaKinesisStreamEvent[] = [];

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: projectorTemplate(),
      bindings: [
        {
          logicalId: "ProjectorFunction",
          handler: (event: SimLambdaKinesisStreamEvent): undefined => {
            events.push(event);

            return undefined;
          },
        },
      ],
    });
    await stack.waitForDeployComplete();

    // When a record is put onto the stream.
    await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-1",
        Data: new TextEncoder().encode("order-1"),
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the deployed mapping delivered it, so the mapping the template
    // described is one that actually polls.
    assertArrayLength(events, 1);
    assertArrayLength(events[0].Records, 1);
    const record = events[0].Records[0];
    assertIdentical(
      record.eventSourceARN,
      `arn:aws:kinesis:${simAws.defaultRegionName}:${simAws.defaultAccountId}:stream/orders`,
    );
    assertIdentical(
      Buffer.from(record.kinesis.data, "base64").toString(),
      "order-1",
    );
  });
});
