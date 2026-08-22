import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";

describe("an AWS::StepFunctions::StateMachine definition held in a bucket", () => {
  const roleArn = "arn:aws:iam::123456789012:role/EnrolmentWorkflowRole";
  const bucketName = "cdk-assets";
  const objectKey = "a1b2c3.asl.json";

  /**
   * A substitution placeholder, written the way a template writes one.
   */
  function placeholder(key: string): string {
    return `\${${key}}`;
  }

  const passChain = {
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
  };

  /**
   * Put a definition where the CDK assets publisher puts one.
   */
  async function publishDefinition(
    simAws: SimAws,
    body: string,
  ): Promise<void> {
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: body,
      }),
    );
  }

  /**
   * A stack holding one workflow whose definition is somewhere else.
   */
  function workflowTemplate(
    definitionS3Location: SimCfnTemplateValue,
    alsoDeclared: Record<string, SimCfnTemplateValue> = {},
  ): CfnTemplateBodyRecord {
    return {
      Resources: {
        Workflow: {
          Type: "AWS::StepFunctions::StateMachine",
          Properties: {
            StateMachineName: "Enrolment",
            RoleArn: roleArn,
            DefinitionS3Location: definitionS3Location,
            ...alsoDeclared,
          },
        },
      },
      Outputs: {
        WorkflowArn: { Value: { "Fn::GetAtt": ["Workflow", "Arn"] } },
      },
    };
  }

  it("runs an execution against a definition fetched from simulated S3", async () => {
    // Given a definition published to a bucket, the way CDK publishes the
    // asset behind DefinitionBody.fromFile.
    const simAws = new SimAws();
    await publishDefinition(simAws, JSON.stringify(passChain));

    // When a stack whose Resource points at that object is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "enrolment",
      template: workflowTemplate({ Bucket: bucketName, Key: objectKey }),
    });
    await stack.waitForDeployComplete();

    // Then the state machine runs the definition the object held.
    const stateMachineArn = stack.outputs.get("WorkflowArn")?.value;
    assertTypeString(stateMachineArn);

    const started = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, input: JSON.stringify({ student: "Wei" }) },
    });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(
      described.output,
      JSON.stringify({ student: "Wei", outcome: { enrolled: true } }),
    );
  });

  it("puts DefinitionSubstitutions into a definition it fetched", async () => {
    // Given a published definition holding a placeholder, and a template
    // naming what it stands for.
    const simAws = new SimAws();
    await publishDefinition(
      simAws,
      JSON.stringify({
        StartAt: "Record",
        States: {
          Record: {
            Type: "Pass",
            Result: { term: placeholder("Term") },
            End: true,
          },
        },
      }),
    );

    // When the stack is deployed and an execution is run.
    const template = workflowTemplate(
      { Bucket: bucketName, Key: objectKey },
      { DefinitionSubstitutions: { Term: 3 } },
    );

    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "enrolment", template });
    await stack.waitForDeployComplete();

    const stateMachineArn = stack.outputs.get("WorkflowArn")?.value;
    assertTypeString(stateMachineArn);

    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn } });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then the placeholder was replaced after the object was read.
    assertIdentical(described.output, JSON.stringify({ term: "3" }));
  });

  it("refuses a DefinitionS3Location that names nowhere", async () => {
    // Given a Resource whose location carries no Key.
    const simAws = new SimAws();

    // When the stack is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "enrolment",
        template: workflowTemplate({ Bucket: bucketName }),
      });
      await stack.waitForDeployComplete();
    });

    // Then the Resource is refused as written wrongly, rather than skipped as
    // something this simulation cannot reach.
    assertStringIncludes(
      error.message,
      "DefinitionS3Location.Key must be a string",
    );
  });
});
