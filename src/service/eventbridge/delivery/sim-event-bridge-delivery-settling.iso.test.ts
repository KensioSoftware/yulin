import {
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { AddPermissionCommand } from "@aws-sdk/client-lambda";
import { assertArrayLength } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/index.js";

const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:fulfilment";

/** How long the handler waits on the clock before it works. */
const handlerDelayMilliseconds = 5;

describe("Settling a simulated EventBridge target delivery", () => {
  it("waits for a Lambda target that waits on the clock", async () => {
    // Given a rule targeting a function that waits on a timer before it works
    const simAws = new SimAws();
    const fulfilled: string[] = [];

    await simAws.lambda().createFunction({
      input: {
        FunctionName: "fulfilment",
        Role: "arn:aws:iam::888888888888:role/FulfilmentRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(async () => {
            await new Promise((resolve) => {
              setTimeout(resolve, handlerDelayMilliseconds);
            });
            fulfilled.push("fulfilled");

            return { ok: true };
          }),
        },
      },
    });
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "fulfilment",
        StatementId: "events",
        Action: "lambda:InvokeFunction",
        Principal: "events.amazonaws.com",
      }),
    );
    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "orders",
        EventPattern: JSON.stringify({ source: ["orders.service"] }),
      }),
    );
    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [{ Id: "fulfilment", Arn: functionArn }],
      }),
    );

    // When a matching event is put and the simulation is asked to settle once
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

    // Then the handler has finished, rather than being left part way through
    // for a later drain to catch
    assertArrayLength(fulfilled, 1);
  });
});
