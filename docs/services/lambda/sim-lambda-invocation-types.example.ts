/**
 * Simulated Lambda Event and DryRun invocation types.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

const handledEvents: unknown[] = [];
await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "recorder",
    Role: "arn:aws:iam::111111111111:role/RecorderRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event) => {
        handledEvents.push(event);
        return null;
      }),
    },
  }),
);

// An Event invocation is accepted before the handler has run.
const eventOutput = await lambda.invoke(
  new InvokeCommand({
    FunctionName: "recorder",
    InvocationType: "Event",
    Payload: JSON.stringify({ recorded: true }),
  }),
);
console.log(eventOutput.StatusCode);
console.log(handledEvents.length);

// The handler runs when simulator background tasks complete.
await simAws.backgroundTasksComplete();
console.log(handledEvents.length);

// A DryRun invocation never runs the handler.
const dryRunOutput = await lambda.invoke(
  new InvokeCommand({
    FunctionName: "recorder",
    InvocationType: "DryRun",
  }),
);
console.log(dryRunOutput.StatusCode);
