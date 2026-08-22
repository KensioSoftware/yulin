/**
 * Running a state per item with a Map state.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const created = await simAws.stepFunctions().createStateMachine({
  input: {
    name: "Enrolment",
    roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
    definition: JSON.stringify({
      StartAt: "Enrol",
      States: {
        Enrol: {
          Type: "Map",
          ItemsPath: "$.students",
          MaxConcurrency: 2,
          ItemSelector: {
            "id.$": "$$.Map.Item.Value.id",
            "at.$": "$$.Map.Item.Index",
            "term.$": "$.term",
          },
          ItemProcessor: {
            StartAt: "Register",
            States: { Register: { Type: "Pass", End: true } },
          },
          End: true,
        },
      },
    }),
  },
});

const started = await simAws.stepFunctions().startExecution({
  input: {
    stateMachineArn: created.stateMachineArn,
    input: JSON.stringify({
      term: 3,
      students: [{ id: "wei" }, { id: "mei" }],
    }),
  },
});

const described = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(described.output);
// [{"id":"wei","at":0,"term":3},{"id":"mei","at":1,"term":3}]

console.log(
  simAws.stepFunctions().inspection().iterations(started.executionArn).length,
); // 2
