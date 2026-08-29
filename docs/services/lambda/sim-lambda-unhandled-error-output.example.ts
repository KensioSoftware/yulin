/**
 * Reading why an invocation failed out of the function's log group.
 */

import { FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(() => {
        console.log("INFO handling order-1");

        throw new Error("order has no items");
      }),
    },
  }),
);

await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));

const failure = await simAws.logs().filterLogEvents(
  new FilterLogEventsCommand({
    logGroupName: "/aws/lambda/orders",
    filterPattern: '"Invoke Error"',
  }),
);

// ERROR Invoke Error {"errorType":"Error","errorMessage":"order has no items",...}
console.log(failure.events?.at(0)?.message);

await simAws.backgroundTasksComplete();
