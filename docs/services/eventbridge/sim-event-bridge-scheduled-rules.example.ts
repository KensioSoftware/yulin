/**
 * A scheduled rule invoking a function three times in three simulated hours.
 */

import { PutRuleCommand, PutTargetsCommand } from "@aws-sdk/client-eventbridge";
import { AddPermissionCommand } from "@aws-sdk/client-lambda";

import { SimAws, SimFixedClock } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

const ranAt: string[] = [];

await simAws.lambda().createFunction({
  input: {
    FunctionName: "reconcile",
    Role: "arn:aws:iam::888888888888:role/ReconcileRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: { time: string }) => {
        ranAt.push(event.time);
        return { ok: true };
      }),
    },
  },
});

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "reconcile",
    StatementId: "events",
    Action: "lambda:InvokeFunction",
    Principal: "events.amazonaws.com",
  }),
);

await simAws.eventBridge().putRule(
  new PutRuleCommand({
    Name: "hourly-reconciliation",
    ScheduleExpression: "rate(1 hour)",
  }),
);

await simAws.eventBridge().putTargets(
  new PutTargetsCommand({
    Rule: "hourly-reconciliation",
    Targets: [
      {
        Id: "reconcile",
        Arn: "arn:aws:lambda:us-east-1:888888888888:function:reconcile",
      },
    ],
  }),
);

// Three simulated hours later, the function has run three times.
await simAws.clock().advanceBy({ hours: 3 });

console.log(ranAt);
// [ '2026-07-26T10:00:00Z', '2026-07-26T11:00:00Z', '2026-07-26T12:00:00Z' ]
