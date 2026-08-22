/**
 * Deploying a Kinesis stream and putting a record onto it.
 */

import { PutRecordCommand } from "@aws-sdk/client-kinesis";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersStream: {
        Type: "AWS::Kinesis::Stream",
        Properties: {
          Name: "orders",
          ShardCount: 2,
          RetentionPeriodHours: 168,
        },
      },
    },
    Outputs: {
      StreamArn: { Value: { "Fn::GetAtt": ["OrdersStream", "Arn"] } },
    },
  },
});

await stack.waitForDeployComplete();

// arn:aws:kinesis:us-east-1:<account>:stream/orders
console.log(stack.outputs.get("StreamArn")?.value);

await simAws.kinesis().putRecord(
  new PutRecordCommand({
    StreamName: "orders",
    PartitionKey: "customer-1",
    Data: new TextEncoder().encode("order-1"),
  }),
);
