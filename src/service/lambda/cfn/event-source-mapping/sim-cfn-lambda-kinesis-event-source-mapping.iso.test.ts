import { PutRecordCommand } from "@aws-sdk/client-kinesis";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import { simKinesisStreamFactory } from "../../../kinesis/stream/sim-kinesis-stream.factory.js";
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
 * A template with a projector function whose role may read a stream, and a
 * mapping between them.
 *
 * The stream itself is made through the SDK rather than declared, because
 * `AWS::Kinesis::Stream` is a separate piece of work. The mapping names it by
 * the ARN it already has, which is what a template referring to a stream in
 * another stack does anyway.
 *
 * The role's grant is split the way CDK's own `grantRead` splits it: the three
 * stream operations on the stream ARN, and `ListStreams` on every stream.
 */
function projectorTemplate(streamArn: string): CfnTemplateBodyRecord {
  return {
    Resources: {
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
                    Resource: streamArn,
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
          EventSourceArn: streamArn,
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
    // Given a stream, and a stack mapping it to a projector function.
    const simAws = new SimAws();
    const stream = await simKinesisStreamFactory.make({}, simAws);
    const events: SimLambdaKinesisStreamEvent[] = [];

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: projectorTemplate(stream.arn),
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
    assertIdentical(record.eventSourceARN, stream.arn);
    assertIdentical(
      Buffer.from(record.kinesis.data, "base64").toString(),
      "order-1",
    );
  });
});
