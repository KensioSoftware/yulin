/**
 * Invoking a Lambda function bound by its CDK construct ID.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "uploads-stack",
  template: {
    Resources: {
      UploadFunction8A7B6C5D: {
        Type: "AWS::Lambda::Function",
        Metadata: {
          "aws:cdk:path": "UploadsStack/UploadFunction/Resource",
        },
        Properties: {
          Role: "arn:aws:iam::111111111111:role/UploadFunctionRole",
        },
      },
    },
  },
  bindings: [
    {
      logicalId: "UploadFunction",
      handler: (event: { key: string }): string => `stored ${event.key}`,
    },
  ],
});

const upload = stack.getResource("UploadFunction");
if (upload === undefined) throw new Error("No UploadFunction Resource");

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: upload.logicalId,
    Payload: JSON.stringify({ key: "receipt.pdf" }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());
// "stored receipt.pdf"

await simAws.backgroundTasksComplete();
