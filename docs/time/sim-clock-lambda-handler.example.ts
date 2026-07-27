/**
 * A simulated Lambda handler reading the simulation's clock.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws, SimFixedClock } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "stamper",
    Role: "arn:aws:iam::111111111111:role/StamperRole",
    Code: {
      // The handler asks JavaScript for the time, not the simulator.
      ZipFile: makeLambdaZipFileInput(() => ({ at: new Date().toISOString() })),
    },
  }),
);

const first = await lambda.invoke(
  new InvokeCommand({ FunctionName: "stamper" }),
);
console.log(Buffer.from(first.Payload!).toString()); // {"at":"2026-07-26T09:00:00.000Z"}

await simAws.clock().advanceBy({ hours: 2 });

const second = await lambda.invoke(
  new InvokeCommand({ FunctionName: "stamper" }),
);
console.log(Buffer.from(second.Payload!).toString()); // {"at":"2026-07-26T11:00:00.000Z"}
