/**
 * A rule and its target, deployed from a template rather than by the SDK.
 */

import { PutEventsCommand } from "@aws-sdk/client-eventbridge";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const handled: unknown[] = [];

await simAws.lambda().createFunction({
  input: {
    FunctionName: "fulfilment",
    Role: "arn:aws:iam::888888888888:role/FulfilmentRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: unknown) => {
        handled.push(event);
        return { ok: true };
      }),
    },
  },
});

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersRule: {
        Type: "AWS::Events::Rule",
        Properties: {
          Name: "orders",
          // A template carries the pattern as an object, where the API takes
          // it as a string of JSON.
          EventPattern: { source: ["orders.service"] },
          Targets: [
            {
              Id: "fulfilment",
              Arn: "arn:aws:lambda:us-east-1:888888888888:function:fulfilment",
            },
          ],
        },
      },
      // The grant CDK emits alongside a Lambda target, and that the target
      // needs here too.
      PermissionForEventsToInvokeLambda: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          FunctionName: "fulfilment",
          Action: "lambda:InvokeFunction",
          Principal: "events.amazonaws.com",
          SourceArn: { "Fn::GetAtt": ["OrdersRule", "Arn"] },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

await simAws.eventBridge().putEvents(
  new PutEventsCommand({
    Entries: [
      {
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "order-1" }),
      },
    ],
  }),
);

await simAws.backgroundTasksComplete();

console.log(handled.length); // 1
