/**
 * Running an execution against a state machine a CDK app deployed.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

// The CDK app holds `new sfn.StateMachine(stack, "Workflow", {
//   stateMachineName: "Enrolment",
//   definitionBody: sfn.DefinitionBody.fromChainable(record.next(done)),
// })`.
await simAws.cloudFormation().deployCdkOut(path.join(process.cwd(), "cdk.out"));

const workflow = simAws.stepFunctions().findStateMachine("Enrolment");

if (workflow === undefined) throw new Error("No Enrolment state machine");

const started = await simAws.stepFunctions().startExecution({
  input: {
    stateMachineArn: workflow.arn,
    input: JSON.stringify({ student: "Wei" }),
  },
});

const described = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(described.status); // SUCCEEDED
