/**
 * A simulated Lambda invocation running out of the time its Timeout allows.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "slowcoach",
    Role: "arn:aws:iam::111111111111:role/SlowcoachRole",
    Timeout: 3,
    Code: {
      ZipFile: makeLambdaZipFileInput(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 60_000);
        });

        return "too late";
      }),
    },
  }),
);

const invocation = lambda.invoke(
  new InvokeCommand({ FunctionName: "slowcoach" }),
);

await simAws.clock().advanceBy({ seconds: 10 });

const output = await invocation;
if (output.Payload === undefined) throw new Error("No invoke Payload");

// Unhandled
console.log(output.FunctionError);

const failure = JSON.parse(Buffer.from(output.Payload).toString()) as {
  errorType: string;
  errorMessage: string;
};

// Sandbox.Timedout
console.log(failure.errorType);
// <deadline instant> <request id> Task timed out after 3.00 seconds
console.log(failure.errorMessage);
