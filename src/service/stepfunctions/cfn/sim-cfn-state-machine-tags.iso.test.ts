import {
  assertArrayEquals,
  assertArrayLength,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";

describe("Tags on a deployed AWS::StepFunctions::StateMachine", () => {
  const roleArn = "arn:aws:iam::123456789012:role/EnrolmentWorkflowRole";

  const done = { StartAt: "Done", States: { Done: { Type: "Succeed" } } };

  /**
   * A pseudo parameter, written the way a template writes one.
   */
  function pseudoParameter(name: string): string {
    return `\${${name}}`;
  }

  /**
   * A stack holding one workflow with the tags a template wrote on it.
   */
  function workflowTemplate(tags: SimCfnTemplateValue): CfnTemplateBodyRecord {
    return {
      Resources: {
        Workflow: {
          Type: "AWS::StepFunctions::StateMachine",
          Properties: {
            StateMachineName: "Enrolment",
            RoleArn: roleArn,
            DefinitionString: JSON.stringify(done),
            Tags: tags,
          },
        },
      },
      Outputs: {
        WorkflowArn: { Value: { "Fn::GetAtt": ["Workflow", "Arn"] } },
      },
    };
  }

  /**
   * Deploy a template, giving back the simulation and the workflow's ARN.
   */
  async function deploy(template: CfnTemplateBodyRecord): Promise<{
    readonly simAws: SimAws;
    readonly stack: SimCfnDeployedStack;
    readonly resourceArn: string;
  }> {
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "enrolment", template });
    await stack.waitForDeployComplete();

    const resourceArn = stack.outputs.get("WorkflowArn")?.value;
    assertTypeString(resourceArn);

    return { simAws, stack, resourceArn };
  }

  it("carries the Tags a template wrote on to the state machine", async () => {
    // Given a template tagging its workflow the way CDK tags one, with an
    // Fn::Sub in a value.
    const { simAws, resourceArn } = await deploy(
      workflowTemplate([
        { Key: "team", Value: "enrolment" },
        {
          Key: "stack",
          Value: { "Fn::Sub": pseudoParameter("AWS::StackName") },
        },
      ]),
    );

    // When the tags are listed off the deployed state machine.
    const listed = await simAws
      .stepFunctions()
      .listTagsForResource({ input: { resourceArn } });

    // Then both are there, with the intrinsic resolved, and a template and an
    // SDK caller read the same tags.
    assertArrayEquals(
      listed.tags.map((tag) => `${tag.key}=${tag.value}`),
      ["stack=enrolment", "team=enrolment"],
    );
  });

  it("records nothing against a Resource whose Tags were carried", async () => {
    // When a template tags its workflow.
    const { simAws, stack, resourceArn } = await deploy(
      workflowTemplate([{ Key: "team", Value: "enrolment" }]),
    );

    // Then the property landed on the state machine, and nothing about it was
    // recorded as unsimulated.
    assertArrayLength(stack.ignoredProperties, 0);

    const listed = await simAws
      .stepFunctions()
      .listTagsForResource({ input: { resourceArn } });
    assertArrayLength(listed.tags, 1);
  });

  it("refuses Tags written as something other than a list", async () => {
    // When a template writes the tags as an object of key and value pairs,
    // which is not the shape CloudFormation takes.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "enrolment",
        template: workflowTemplate({ team: "enrolment" }),
      });
      await stack.waitForDeployComplete();
    });

    assertStringIncludes(error.message, "Tags must be a list");
  });

  it("refuses a tag entry with no Key", async () => {
    // When an entry of the list names no key.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "enrolment",
        template: workflowTemplate([{ Value: "enrolment" }]),
      });
      await stack.waitForDeployComplete();
    });

    assertStringIncludes(error.message, "Tags[0].Key must be a string");
  });

  it("refuses a tag Step Functions itself will not take", async () => {
    // When a template writes a key under the prefix AWS keeps for itself.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "enrolment",
        template: workflowTemplate([{ Key: "aws:owner", Value: "nobody" }]),
      });
      await stack.waitForDeployComplete();
    });

    // Then the Resource is refused in the words CreateStateMachine refuses it
    // in, naming the Resource that asked.
    assertStringIncludes(error.message, "Resource Workflow");
    assertStringIncludes(error.message, "reserved aws: prefix");
  });
});
