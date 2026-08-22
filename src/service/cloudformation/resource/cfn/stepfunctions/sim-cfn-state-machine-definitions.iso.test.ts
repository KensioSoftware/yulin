import { assertIdentical, assertTypeString } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";

describe("AWS::StepFunctions::StateMachine definitions", () => {
  const roleArn = "arn:aws:iam::123456789012:role/EnrolmentWorkflowRole";

  /**
   * A stack holding a queue and a workflow that carries the queue's ARN
   * through to its output.
   *
   * The queue is there to put a Resource ARN in the definition, which is what
   * makes the intrinsics worth resolving before the definition is read.
   */
  function workflowTemplate(
    definitionProperties: Record<string, SimCfnTemplateValue>,
  ): CfnTemplateBodyRecord {
    return {
      Resources: {
        OrdersQueue: { Type: "AWS::SQS::Queue", Properties: {} },
        Workflow: {
          Type: "AWS::StepFunctions::StateMachine",
          Properties: {
            StateMachineName: "Enrolment",
            RoleArn: roleArn,
            ...definitionProperties,
          },
        },
      },
      Outputs: {
        WorkflowArn: { Value: { "Fn::GetAtt": ["Workflow", "Arn"] } },
        QueueArn: { Value: { "Fn::GetAtt": ["OrdersQueue", "Arn"] } },
      },
    };
  }

  /**
   * Deploy a template and run one execution against the state machine in it.
   */
  async function runWorkflow(
    template: CfnTemplateBodyRecord,
  ): Promise<{ readonly output: string; readonly queueArn: string }> {
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "enrolment", template });
    await stack.waitForDeployComplete();

    const stateMachineArn = stack.outputs.get("WorkflowArn")?.value;
    assertTypeString(stateMachineArn);
    const queueArn = stack.outputs.get("QueueArn")?.value;
    assertTypeString(queueArn);

    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn } });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    assertIdentical(described.status, "SUCCEEDED");

    return { output: described.output ?? "", queueArn };
  }

  it("reads a DefinitionString written as an Fn::Join over a Resource", async () => {
    // Given a definition built the way CDK builds one, as an Fn::Join with a
    // Resource attribute in the middle of it.
    const template = workflowTemplate({
      DefinitionString: {
        "Fn::Join": [
          "",
          [
            '{"StartAt":"Record","States":{"Record":{"Type":"Pass","Result":{"queue":"',
            { "Fn::GetAtt": ["OrdersQueue", "Arn"] },
            '"},"End":true}}}',
          ],
        ],
      },
    });

    // When the stack is deployed and an execution is run.
    const { output, queueArn } = await runWorkflow(template);

    // Then the execution ran the joined definition, carrying the ARN the
    // intrinsics resolved to.
    assertIdentical(output, JSON.stringify({ queue: queueArn }));
  });

  it("reads a Definition written as template data", async () => {
    // Given the same workflow written as an object rather than as a string,
    // which is the form a hand-written template tends to use.
    const template = workflowTemplate({
      Definition: {
        StartAt: "Record",
        States: {
          Record: {
            Type: "Pass",
            Result: { queue: { "Fn::GetAtt": ["OrdersQueue", "Arn"] } },
            End: true,
          },
        },
      },
    });

    // When the stack is deployed and an execution is run.
    const { output, queueArn } = await runWorkflow(template);

    // Then the definition was read as Amazon States Language directly, with
    // its intrinsics resolved the same way.
    assertIdentical(output, JSON.stringify({ queue: queueArn }));
  });

  /**
   * A substitution placeholder, written the way a template writes one.
   */
  function placeholder(key: string): string {
    return `\${${key}}`;
  }

  it("puts DefinitionSubstitutions into the definition", async () => {
    // Given a definition holding a placeholder, and a substitution naming the
    // queue it stands for.
    const template = workflowTemplate({
      DefinitionString: JSON.stringify({
        StartAt: "Record",
        States: {
          Record: {
            Type: "Pass",
            Result: {
              queue: placeholder("OrdersQueueArn"),
              attempts: placeholder("Attempts"),
            },
            End: true,
          },
        },
      }),
      DefinitionSubstitutions: {
        OrdersQueueArn: { "Fn::GetAtt": ["OrdersQueue", "Arn"] },
        Attempts: 3,
      },
    });

    // When the stack is deployed and an execution is run.
    const { output, queueArn } = await runWorkflow(template);

    // Then every placeholder was replaced before the definition was read.
    assertIdentical(output, JSON.stringify({ queue: queueArn, attempts: "3" }));
  });
});
