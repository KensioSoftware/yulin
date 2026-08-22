import {
  assertIdentical,
  assertStringStartsWith,
  assertTypeString,
} from "@kensio/smartass";
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

describe("Sim CDK Step Functions StateMachine deployment local integration", () => {
  it("runs an execution against a state machine CDK synthesized", async () => {
    // Given a CDK stack holding an unnamed state machine, chained from the
    // constructs rather than written as Amazon States Language.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(`
import * as cdk from "aws-cdk-lib/core";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const record = new sfn.Pass(stack, "Record", {
  result: sfn.Result.fromObject({ enrolled: true }),
  resultPath: "$.outcome",
});

const workflow = new sfn.StateMachine(stack, "Workflow", {
  definitionBody: sfn.DefinitionBody.fromChainable(
    record.next(new sfn.Succeed(stack, "Done")),
  ),
});

new cdk.CfnOutput(stack, "WorkflowArn", { value: workflow.stateMachineArn });
new cdk.CfnOutput(stack, "WorkflowName", { value: workflow.stateMachineName });

app.synth();
    `);

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template into the account and region the
    // CDK app declares, with no hand-editing of the
    // AWS::StepFunctions::StateMachine Resource CDK emits.
    const simAws = new SimAws();
    const scoped = simAws.account(accountIdOneOnes).region("eu-west-2");
    const stack = await scoped
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the state machine is named after the stack and the logical ID,
    // because the CDK construct did not name it.
    const stateMachineName = stack.outputs.get("WorkflowName")?.value;
    assertTypeString(stateMachineName);
    assertStringStartsWith(stateMachineName, "TestStack-Workflow");

    // And the ARN CDK reads as a Ref is the one the state machine answers to.
    const stateMachineArn = stack.outputs.get("WorkflowArn")?.value;
    assertTypeString(stateMachineArn);

    const described = await scoped
      .stepFunctions()
      .describeStateMachine({ input: { stateMachineArn } });
    assertIdentical(described.name, stateMachineName);
    assertIdentical(described.type, "STANDARD");

    // And an execution walks the chain the constructs were wired into.
    const started = await scoped.stepFunctions().startExecution({
      input: { stateMachineArn, input: JSON.stringify({ student: "Wei" }) },
    });
    const execution = await scoped
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    assertIdentical(execution.status, "SUCCEEDED");
    assertIdentical(
      execution.output,
      JSON.stringify({ student: "Wei", outcome: { enrolled: true } }),
    );

    await simAws.backgroundTasksComplete();
  });
});
