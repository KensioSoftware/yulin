import { assertIdentical, assertTypeString } from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file to pass to sim CloudFormation, so the template under test is
 * one CDK actually produced rather than one written by hand.
 */
import { SimAws } from "../../../aws/sim-aws.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

const accountIdOneOnes = "111111111111";

describe("Sim CDK Step Functions LambdaInvoke local integration", () => {
  it("invokes the function a LambdaInvoke task names", async () => {
    // Given a CDK stack whose workflow is one LambdaInvoke task over a
    // function in the same stack. CDK writes the function's ARN into the
    // DefinitionString as an Fn::Join, and grants the state machine's role
    // permission to invoke it.
    //
    // `retryOnServiceExceptions` is off because CDK otherwise gives the task
    // a Retry on the Lambda service errors, and Retry is unsimulated
    // (https://github.com/KensioSoftware/yulin/issues/920). A state machine
    // carrying one is skipped with that reason.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(`
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const check = new lambda.Function(stack, "Check", {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(
    "exports.handler = async (event) => ({ enrolled: event.student });",
  ),
});

const workflow = new sfn.StateMachine(stack, "Workflow", {
  stateMachineName: "Enrolment",
  definitionBody: sfn.DefinitionBody.fromChainable(
    new tasks.LambdaInvoke(stack, "CheckEnrolment", {
      lambdaFunction: check,
      payloadResponseOnly: true,
      retryOnServiceExceptions: false,
    }),
  ),
});

new cdk.CfnOutput(stack, "WorkflowArn", { value: workflow.stateMachineArn });

app.synth();
    `);

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template into the account and region the
    // CDK app declares.
    const simAws = new SimAws();
    const scoped = simAws.account(accountIdOneOnes).region("eu-west-2");
    const stack = await scoped
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then an execution reaches the function through the ARN the Fn::Join
    // resolved, assuming the role CDK gave the state machine.
    const stateMachineArn = stack.outputs.get("WorkflowArn")?.value;
    assertTypeString(stateMachineArn);

    const started = await scoped.stepFunctions().startExecution({
      input: { stateMachineArn, input: JSON.stringify({ student: "Wei" }) },
    });
    const execution = await scoped
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    assertIdentical(execution.status, "SUCCEEDED");
    assertIdentical(execution.output, JSON.stringify({ enrolled: "Wei" }));

    await simAws.backgroundTasksComplete();
  });
});
