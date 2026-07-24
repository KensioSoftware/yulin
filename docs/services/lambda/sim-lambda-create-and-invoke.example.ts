/**
 * Creating and invoking a simulated Lambda function backed by a real
 * in-process handler function.
 */

import {
  CreateFunctionCommand,
  GetFunctionCommand,
  InvokeCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "greeter",
    Role: "arn:aws:iam::111111111111:role/GreeterRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: { name: string }) => `Hello ${event.name}`,
      ),
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
console.log(invokeOutput.StatusCode);
console.log(Buffer.from(invokeOutput.Payload).toString());

await simAws.backgroundTasksComplete();

const fetched = await lambda.getFunction(
  new GetFunctionCommand({ FunctionName: "greeter" }),
);
console.log(fetched.Configuration.State);
