/**
 * Retrying a failing task on the clock, and catching what the retries leave.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand } from "@aws-sdk/client-lambda";

import { SimAws, SimFixedClock } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

// The enrolment service is down for the whole of this run.
await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "check-enrolment",
    Role: "arn:aws:iam::123456789012:role/FunctionRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(() => {
        throw new Error("the enrolment service is down");
      }),
    },
  }),
);

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "WorkflowRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "states.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "WorkflowRole",
    PolicyName: "InvokeEnrolmentFunctions",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "lambda:InvokeFunction",
        Resource: "*",
      },
    }),
  }),
);

const created = await simAws.stepFunctions().createStateMachine({
  input: {
    name: "Enrolment",
    roleArn: role.Role.Arn,
    definition: JSON.stringify({
      StartAt: "Check",
      States: {
        Check: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "check-enrolment", "Payload.$": "$" },
          Retry: [
            {
              ErrorEquals: ["States.TaskFailed"],
              IntervalSeconds: 2,
              MaxAttempts: 2,
            },
          ],
          Catch: [
            {
              ErrorEquals: ["States.ALL"],
              Next: "Compensate",
              ResultPath: "$.error",
            },
          ],
          Next: "Enrol",
        },
        Enrol: { Type: "Pass", Result: { enrolled: true }, End: true },
        Compensate: { Type: "Pass", End: true },
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

// The attempts fall at 0, 2 and 6 seconds. One advance covers all three.
await simAws.clock().advanceBy({ seconds: 10 });

const described = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(described.status); // SUCCEEDED
console.log(described.stopDate); // 2026-07-26T09:00:06.000Z

// {"student":"Wei","error":{"Error":"States.TaskFailed","Cause":"The function
//  the Task state Check invoked raised Error: the enrolment service is down"}}
console.log(described.output);

// [ { stateName: 'Check', error: 'States.TaskFailed' },
//   { stateName: 'Check', error: 'States.TaskFailed' },
//   { stateName: 'Check', error: 'States.TaskFailed' },
//   { stateName: 'Compensate' } ]
console.log(simAws.stepFunctions().inspection().attempts(started.executionArn));
