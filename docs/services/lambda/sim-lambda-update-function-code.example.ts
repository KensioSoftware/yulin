/**
 * Replacing the code a simulated Lambda function runs, part-way through.
 */

import {
  CreateFunctionCommand,
  InvokeCommand,
  UpdateFunctionCodeCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Code: { ZipFile: makeLambdaZipFileInput(() => ({ ok: true })) },
  }),
);

await lambda.updateFunctionCode(
  new UpdateFunctionCodeCommand({
    FunctionName: "orders",
    ZipFile: makeLambdaZipFileInput(() => {
      throw new Error("the order service is down");
    }),
  }),
);

const invoked = await lambda.invoke(
  new InvokeCommand({ FunctionName: "orders" }),
);
console.log(invoked.FunctionError);

await simAws.backgroundTasksComplete();
