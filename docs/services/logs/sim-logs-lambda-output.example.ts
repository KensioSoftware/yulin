/**
 * Asserting on what a simulated Lambda handler logged.
 */

import { FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaCodeZip } from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
    Handler: "index.handler",
    Code: {
      ZipFile: makeLambdaCodeZip({
        "index.js":
          "exports.handler = async () => {\n" +
          '  console.error("ERROR order has no items");\n' +
          "};\n",
      }),
    },
  }),
);

await simAws.backgroundTasksComplete();
await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));

const found = await simAws.logs().filterLogEvents(
  new FilterLogEventsCommand({
    logGroupName: "/aws/lambda/orders",
    filterPattern: "ERROR",
  }),
);

console.log(found.events?.[0]?.message);
