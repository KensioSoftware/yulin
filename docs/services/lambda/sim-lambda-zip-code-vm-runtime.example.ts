/**
 * Running zip-packaged function code in the simulated vm runtime.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaCodeZip } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

const codeZip = makeLambdaCodeZip(`
  let invocations = 0;
  exports.handler = async (event) => {
    invocations += 1;
    return { name: event.name, invocations };
  };
`);

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "warm-counter",
    Role: "arn:aws:iam::111111111111:role/WarmCounterRole",
    Handler: "index.handler",
    Runtime: "nodejs22.x",
    Code: { ZipFile: codeZip },
  }),
);

const first = await lambda.invoke(
  new InvokeCommand({
    FunctionName: "warm-counter",
    Payload: JSON.stringify({ name: "one" }),
  }),
);
const second = await lambda.invoke(
  new InvokeCommand({
    FunctionName: "warm-counter",
    Payload: JSON.stringify({ name: "two" }),
  }),
);

if (first.Payload === undefined || second.Payload === undefined) {
  throw new Error("No invoke Payload");
}
console.log(Buffer.from(first.Payload).toString());
console.log(Buffer.from(second.Payload).toString());

await simAws.backgroundTasksComplete();
