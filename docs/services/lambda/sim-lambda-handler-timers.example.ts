/**
 * A simulated Lambda handler sleeping on the simulation's clock.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "batcher",
    Role: "arn:aws:iam::111111111111:role/BatcherRole",
    Timeout: 60,
    Code: {
      ZipFile: makeLambdaZipFileInput(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 30_000);
        });

        return "batched";
      }),
    },
  }),
);

// Asked for and left running, because the handler is waiting on the clock.
const invocation = lambda.invoke(
  new InvokeCommand({ FunctionName: "batcher" }),
);

await simAws.clock().advanceBy({ seconds: 30 });

const output = await invocation;
if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());
