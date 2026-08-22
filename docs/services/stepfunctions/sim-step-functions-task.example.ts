/**
 * A workflow whose Task states invoke simulated Lambda functions.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "check-enrolment",
    Role: "arn:aws:iam::123456789012:role/FunctionRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: { term: number }) => ({
        eligible: event.term > 1,
      })),
    },
  }),
);

const enrol = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "enrol-student",
    Role: "arn:aws:iam::123456789012:role/FunctionRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: { student: string }) => ({
        enrolled: event.student,
      })),
    },
  }),
);

// The execution assumes this role, and invokes both functions as it.
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
          ResultSelector: { "eligible.$": "$.Payload.eligible" },
          ResultPath: "$.outcome",
          Next: "Eligible",
        },
        Eligible: {
          Type: "Choice",
          Choices: [
            {
              Variable: "$.outcome.eligible",
              BooleanEquals: true,
              Next: "Enrol",
            },
          ],
          Default: "Decline",
        },
        Enrol: { Type: "Task", Resource: enrol.FunctionArn, End: true },
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

const described = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(described.output); // {"enrolled":"Wei"}
