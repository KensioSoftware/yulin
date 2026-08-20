/**
 * Changing a simulated Lambda function's timeout and environment variables.
 */

import {
  CreateFunctionCommand,
  InvokeCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Timeout: 30,
    Environment: { Variables: { ORDERS_TABLE: "orders-v1" } },
    Code: {
      ZipFile: makeLambdaZipFileInput((_event, context) => ({
        table: process.env["ORDERS_TABLE"],
        remainingMs: context.getRemainingTimeInMillis(),
      })),
    },
  }),
);

await lambda.updateFunctionConfiguration(
  new UpdateFunctionConfigurationCommand({
    FunctionName: "orders",
    Timeout: 1,
    Environment: { Variables: { ORDERS_TABLE: "orders-v2" } },
  }),
);

const invoked = await lambda.invoke(
  new InvokeCommand({ FunctionName: "orders" }),
);
console.log(Buffer.from(invoked.Payload ?? new Uint8Array()).toString());

await simAws.backgroundTasksComplete();
