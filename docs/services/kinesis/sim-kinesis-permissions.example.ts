/**
 * Refusing a producer that has no permission on the stream.
 */

import { PutRecordCommand } from "@aws-sdk/client-kinesis";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// A Role allowed to read the stream and nothing else.
const { Role } = await simAws.iam().createRole({
  input: {
    RoleName: "OrderReader",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  },
});

await simAws.iam().putRolePolicy({
  input: {
    RoleName: "OrderReader",
    PolicyName: "ReadOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        { Effect: "Allow", Action: "kinesis:GetRecords", Resource: "*" },
      ],
    }),
  },
});

await simAws.kinesis().createStream({ input: { StreamName: "orders" } });

try {
  await simAws.kinesis().putRecord(
    new PutRecordCommand({
      StreamName: "orders",
      PartitionKey: "customer-1",
      Data: new TextEncoder().encode("order-1"),
    }),
    { caller: { kind: "arn", arn: Role.Arn } },
  );
} catch (error) {
  // User: arn:aws:iam::...:role/OrderReader is not authorized to perform:
  // kinesis:PutRecord on resource: arn:aws:kinesis:...:stream/orders
  console.log((error as Error).message);
}
