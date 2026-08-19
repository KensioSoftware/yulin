/**
 * Asserting on what a bound in-process Lambda handler printed.
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
      ZipFile: makeLambdaZipFileInput((event: { orderId: string }) => {
        console.log(`ERROR ${event.orderId} has no items`);

        return "rejected";
      }),
    },
  }),
);

await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "orders",
    Payload: JSON.stringify({ orderId: "order-1" }),
  }),
);

const logged = await simAws.logs().filterLogEvents(
  new FilterLogEventsCommand({
    logGroupName: "/aws/lambda/orders",
    filterPattern: "ERROR",
  }),
);

// [ 'ERROR order-1 has no items' ]
console.log(logged.events?.map((event) => event.message));

await simAws.backgroundTasksComplete();
