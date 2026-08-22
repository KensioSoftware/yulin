/**
 * Delivering a simulated Kinesis stream's records to a simulated function.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateStreamCommand, PutRecordCommand } from "@aws-sdk/client-kinesis";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import {
  makeLambdaZipFileInput,
  type SimLambdaKinesisStreamEvent,
} from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws
  .kinesis()
  .createStream(new CreateStreamCommand({ StreamName: "orders" }));

const streamArn = `arn:aws:kinesis:${simAws.defaultRegionName}:${simAws.defaultAccountId}:stream/orders`;

const { Role } = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrderProjectorRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "OrderProjectorRole",
    PolicyName: "ReadOrders",
    PolicyDocument: JSON.stringify({
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
        { Effect: "Allow", Action: "kinesis:ListStreams", Resource: "*" },
      ],
    }),
  }),
);

const projected: string[] = [];

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-projector",
    Role: Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: SimLambdaKinesisStreamEvent): void => {
          for (const record of event.Records) {
            // The payload arrives base64 encoded, as it does on AWS.
            projected.push(
              Buffer.from(record.kinesis.data, "base64").toString("utf8"),
            );
          }
        },
      ),
    },
  }),
);

await simAws.lambda().createEventSourceMapping(
  new CreateEventSourceMappingCommand({
    EventSourceArn: streamArn,
    FunctionName: "order-projector",
    StartingPosition: "TRIM_HORIZON",
  }),
);

await simAws.kinesis().putRecord(
  new PutRecordCommand({
    StreamName: "orders",
    PartitionKey: "customer-1",
    Data: new TextEncoder().encode('{"id":"order-1"}'),
  }),
);

// Delivery happens in the background, so wait for the simulation to settle.
await simAws.backgroundTasksComplete();

console.log(projected[0]); // {"id":"order-1"}
