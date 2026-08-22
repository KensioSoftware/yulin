/**
 * Branching on an execution's data with a Choice state.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const created = await simAws.stepFunctions().createStateMachine({
  input: {
    name: "Enrolment",
    roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
    definition: JSON.stringify({
      StartAt: "Eligible",
      States: {
        Eligible: {
          Type: "Choice",
          Choices: [
            {
              And: [
                { Variable: "$.term", IsPresent: true },
                { Variable: "$.term", NumericGreaterThanEquals: 2 },
              ],
              Next: "Enrol",
            },
          ],
          Default: "Decline",
        },
        Enrol: { Type: "Pass", Result: { enrolled: true }, End: true },
        Decline: { Type: "Fail", Error: "NotEligible" },
      },
    }),
  },
});

const started = await simAws.stepFunctions().startExecution({
  input: {
    stateMachineArn: created.stateMachineArn,
    input: JSON.stringify({ student: "Wei", term: 3 }),
  },
});

console.log(
  simAws.stepFunctions().inspection().visitedStates(started.executionArn),
); // [ 'Eligible', 'Enrol' ]

const described = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(described.output); // {"enrolled":true}
