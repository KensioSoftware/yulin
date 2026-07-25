/**
 * Giving a simulated Lambda function its own environment variables, read by
 * a real in-process handler function.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "greeter",
    Role: "arn:aws:iam::111111111111:role/GreeterRole",
    Environment: {
      Variables: { GREETING: "Hello", TABLE_NAME: "widgets" },
    },
    Code: {
      ZipFile: makeLambdaZipFileInput((event: { name: string }) => ({
        // Read inside the handler, so this sees the function's own
        // variables rather than the ones the test process happens to have.
        message: `${process.env["GREETING"] ?? "Hi"} ${event.name}`,
        tableName: process.env["TABLE_NAME"],
        region: process.env["AWS_REGION"],
      })),
    },
  }),
);

const invokeOutput = await lambda.invoke(
  new InvokeCommand({
    FunctionName: "greeter",
    Payload: JSON.stringify({ name: "Yulin" }),
  }),
);

if (invokeOutput.Payload === undefined) throw new Error("No invoke Payload");
// {"message":"Hello Yulin","tableName":"widgets","region":"eu-west-2"}
console.log(Buffer.from(invokeOutput.Payload).toString());
