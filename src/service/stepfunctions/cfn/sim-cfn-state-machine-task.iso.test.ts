import { assertIdentical, assertTypeString } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";

describe("a Task state a deployed AWS::StepFunctions::StateMachine invokes", () => {
  /**
   * The function the workflow invokes, with the role it runs as.
   */
  const handlerResources: Record<string, SimCfnTemplateValue> = {
    HandlerRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: "HandlerRole",
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "lambda.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        },
      },
    },
    Handler: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: "check-enrolment",
        Role: { "Fn::GetAtt": ["HandlerRole", "Arn"] },
        Handler: "index.handler",
        Runtime: "nodejs20.x",
        Code: {
          ZipFile:
            "exports.handler = async (event) => ({ enrolled: event.student });",
        },
      },
    },
  };

  /**
   * The role an execution assumes, allowed to invoke the function.
   */
  const workflowRole: SimCfnTemplateValue = {
    Type: "AWS::IAM::Role",
    Properties: {
      RoleName: "WorkflowRole",
      AssumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "states.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      },
      Policies: [
        {
          PolicyName: "InvokeHandler",
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: "lambda:InvokeFunction",
                Resource: { "Fn::GetAtt": ["Handler", "Arn"] },
              },
            ],
          },
        },
      ],
    },
  };

  /**
   * A stack holding the function, the two roles and a workflow declared with
   * the given definition.
   */
  function workflowTemplate(
    definitionString: SimCfnTemplateValue,
  ): CfnTemplateBodyRecord {
    return {
      Resources: {
        ...handlerResources,
        WorkflowRole: workflowRole,
        Workflow: {
          Type: "AWS::StepFunctions::StateMachine",
          Properties: {
            StateMachineName: "Enrolment",
            RoleArn: { "Fn::GetAtt": ["WorkflowRole", "Arn"] },
            DefinitionString: definitionString,
          },
        },
      },
      Outputs: {
        WorkflowArn: { Value: { "Fn::GetAtt": ["Workflow", "Arn"] } },
      },
    };
  }

  /**
   * Deploy a template and run one execution against the workflow in it.
   */
  async function runWorkflow(
    template: CfnTemplateBodyRecord,
  ): Promise<string | undefined> {
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "enrolment", template });
    await stack.waitForDeployComplete();

    const stateMachineArn = stack.outputs.get("WorkflowArn")?.value;
    assertTypeString(stateMachineArn);

    const started = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, input: JSON.stringify({ student: "Wei" }) },
    });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    assertIdentical(described.status, "SUCCEEDED");

    return described.output;
  }

  it("invokes a function an Fn::Join put into the definition as a Ref", async () => {
    // Given a definition built the way CDK builds one, joined around a Ref to
    // the function the Task invokes. A Ref to an AWS::Lambda::Function is its
    // name, which is what the optimised integration's FunctionName takes.
    const template = workflowTemplate({
      "Fn::Join": [
        "",
        [
          '{"StartAt":"Check","States":{"Check":{"Type":"Task",' +
            '"Resource":"arn:aws:states:::lambda:invoke",' +
            '"Parameters":{"FunctionName":"',
          { Ref: "Handler" },
          '","Payload.$":"$"},"OutputPath":"$.Payload","End":true}}}',
        ],
      ],
    });

    // When the stack is deployed and an execution is run.
    const output = await runWorkflow(template);

    // Then the Task reached the function the Ref resolved to, and the
    // execution carries what the handler returned.
    assertIdentical(output, JSON.stringify({ enrolled: "Wei" }));
  });

  it("invokes a function an Fn::Join put into the definition as an ARN", async () => {
    // Given the payloadResponseOnly form CDK writes, where the Resource is
    // the function ARN itself rather than the optimised integration.
    const template = workflowTemplate({
      "Fn::Join": [
        "",
        [
          '{"StartAt":"Check","States":{"Check":{"Type":"Task","Resource":"',
          { "Fn::GetAtt": ["Handler", "Arn"] },
          '","End":true}}}',
        ],
      ],
    });

    // When the stack is deployed and an execution is run.
    const output = await runWorkflow(template);

    // Then the handler was sent the execution's own input and answered with
    // what it returned, with no Invoke response wrapped around it.
    assertIdentical(output, JSON.stringify({ enrolled: "Wei" }));
  });
});
