/**
 * Creating a simulated Lambda function from a code zip stored in sim S3.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { makeLambdaCodeZip } from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws
  .s3()
  .createBucket(new CreateBucketCommand({ Bucket: "code-bucket" }));
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "code-bucket",
    Key: "artifacts/greeter.zip",
    Body: makeLambdaCodeZip(
      "exports.handler = async (event) => 'Hello ' + event.name + ' from S3';",
    ),
  }),
);

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "s3-greeter",
    Role: "arn:aws:iam::111111111111:role/S3GreeterRole",
    Handler: "index.handler",
    Code: {
      S3Bucket: "code-bucket",
      S3Key: "artifacts/greeter.zip",
    },
  }),
);

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "s3-greeter",
    Payload: JSON.stringify({ name: "Yulin" }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());

await simAws.backgroundTasksComplete();
