/**
 * Switching a simulated Lambda function off with a reservation of zero.
 */

import {
  CreateFunctionCommand,
  DeleteFunctionConcurrencyCommand,
  InvokeCommand,
  PutFunctionConcurrencyCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Code: { ZipFile: makeLambdaZipFileInput(() => "handled") },
  }),
);

await lambda.putFunctionConcurrency(
  new PutFunctionConcurrencyCommand({
    FunctionName: "orders",
    ReservedConcurrentExecutions: 0,
  }),
);

try {
  await lambda.invoke(new InvokeCommand({ FunctionName: "orders" }));
} catch (error) {
  console.log((error as Error).name); // TooManyRequestsException
}

await lambda.deleteFunctionConcurrency(
  new DeleteFunctionConcurrencyCommand({ FunctionName: "orders" }),
);

const invoked = await lambda.invoke(
  new InvokeCommand({ FunctionName: "orders" }),
);
console.log(invoked.StatusCode); // 200

await simAws.backgroundTasksComplete();
