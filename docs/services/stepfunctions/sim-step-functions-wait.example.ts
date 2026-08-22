/**
 * Holding an execution at a Wait state, then moving time past it.
 */

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

const created = await simAws.stepFunctions().createStateMachine({
  input: {
    name: "Enrolment",
    roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
    definition: JSON.stringify({
      StartAt: "Settle",
      States: {
        Settle: { Type: "Wait", Seconds: 300, Next: "Confirm" },
        Confirm: { Type: "Pass", Result: { confirmed: true }, End: true },
      },
    }),
  },
});

const started = await simAws.stepFunctions().startExecution({
  input: {
    stateMachineArn: created.stateMachineArn,
    input: JSON.stringify({ student: "Wei" }),
  },
});

const waiting = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(waiting.status); // RUNNING

await simAws.clock().advanceBy({ minutes: 6 });

const settled = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(settled.status); // SUCCEEDED
console.log(settled.stopDate); // 2026-07-26T09:05:00.000Z
