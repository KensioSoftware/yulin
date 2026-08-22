import { assertIdentical, assertTypeString } from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file and asset manifest to pass to sim CloudFormation.
 */
import { SimAws } from "../../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

const accountIdOneOnes = "111111111111";

describe("Sim CDK Step Functions DefinitionBody.fromFile local integration", () => {
  it("runs an execution against a definition CDK staged as an asset", async () => {
    // Given a CDK stack whose definition is a file on disk. CDK stages the
    // file in the cloud assembly and writes DefinitionS3Location, rather than
    // putting the Amazon States Language in the template.
    const projectDirectory = new TemporaryDirectory();
    await projectDirectory.writeFile(
      "enrolment.asl.json",
      JSON.stringify({
        StartAt: "Record",
        States: {
          Record: {
            Type: "Pass",
            Result: { enrolled: true },
            ResultPath: "$.outcome",
            Next: "Done",
          },
          Done: { Type: "Succeed" },
        },
      }),
    );
    const definitionFile = projectDirectory.join("enrolment.asl.json");

    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(`
import * as cdk from "aws-cdk-lib/core";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const workflow = new sfn.StateMachine(stack, "Workflow", {
  stateMachineName: "Enrolment",
  definitionBody: sfn.DefinitionBody.fromFile(${JSON.stringify(definitionFile)}),
});

new cdk.CfnOutput(stack, "WorkflowArn", { value: workflow.stateMachineArn });

app.synth();
    `);

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template into the account and region the
    // CDK app declares. The assets publisher puts the staged definition into
    // the staging bucket first, as a real `cdk deploy` does.
    const simAws = new SimAws();
    const scoped = simAws.account(accountIdOneOnes).region("eu-west-2");
    const stack = await scoped
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the state machine runs the definition the file held.
    const stateMachineArn = stack.outputs.get("WorkflowArn")?.value;
    assertTypeString(stateMachineArn);

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
