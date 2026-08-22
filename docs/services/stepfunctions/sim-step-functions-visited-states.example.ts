/**
 * Reading back which states an execution went through.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const created = await simAws.stepFunctions().createStateMachine({
  input: {
    name: "Enrolment",
    roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
    definition: JSON.stringify({
      StartAt: "Check",
      States: {
        Check: { Type: "Pass", Next: "Decline" },
        Decline: { Type: "Fail", Error: "NotEligible", Cause: "No place left" },
      },
    }),
  },
});

const started = await simAws
  .stepFunctions()
  .startExecution({ input: { stateMachineArn: created.stateMachineArn } });

console.log(
  simAws.stepFunctions().inspection().visitedStates(started.executionArn),
); // [ 'Check', 'Decline' ]

const described = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(described.status); // FAILED
console.log(described.error); // NotEligible
