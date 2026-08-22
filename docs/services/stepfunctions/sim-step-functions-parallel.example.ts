/**
 * Running two branches at once with a Parallel state.
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
      StartAt: "Enrol",
      States: {
        Enrol: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "Settle",
              States: {
                Settle: { Type: "Wait", Seconds: 300, Next: "Register" },
                Register: {
                  Type: "Pass",
                  Result: { registered: true },
                  End: true,
                },
              },
            },
            {
              StartAt: "Bill",
              States: {
                Bill: { Type: "Pass", Result: { billed: true }, End: true },
              },
            },
          ],
          Next: "Confirm",
        },
        Confirm: { Type: "Pass", End: true },
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

console.log(settled.output); // [{"registered":true},{"billed":true}]

console.log(
  simAws
    .stepFunctions()
    .inspection()
    .branches(started.executionArn)
    .map((branch) => branch.visitedStates),
); // [ [ 'Settle', 'Register' ], [ 'Bill' ] ]
