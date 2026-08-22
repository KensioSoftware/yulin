import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimStatesResourceNotFound } from "../error/sim-step-functions.error.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

describe("deployed AWS::StepFunctions::StateMachine Resources", () => {
  const roleArn = "arn:aws:iam::123456789012:role/EnrolmentWorkflowRole";

  /**
   * A workflow of the state types the interpreter runs today.
   */
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
   * A stack holding one state machine, and outputs reading it every way the
   * Resource publishes.
   */
  function workflowTemplate(
    properties: SimCfnTemplateValueRecord,
  ): CfnTemplateBodyRecord {
    return {
      Resources: {
        Workflow: {
          Type: "AWS::StepFunctions::StateMachine",
          Properties: properties,
        },
      },
      Outputs: {
        WorkflowRef: { Value: { Ref: "Workflow" } },
        WorkflowArn: { Value: { "Fn::GetAtt": ["Workflow", "Arn"] } },
        WorkflowName: { Value: { "Fn::GetAtt": ["Workflow", "Name"] } },
      },
    };
  }

  it("runs an execution against a state machine a template deployed", async () => {
    // Given a template declaring a workflow of the states the interpreter
    // runs.
    const simAws = new SimAws();

    // When it is deployed and an execution is started against it.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "enrolment",
      template: workflowTemplate({
        StateMachineName: "Enrolment",
        RoleArn: roleArn,
        DefinitionString: JSON.stringify(passChain),
      }),
    });
    await stack.waitForDeployComplete();

    const stateMachineArn = stack.outputs.get("WorkflowArn")?.value;
    assertTypeString(stateMachineArn);

    const started = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, input: JSON.stringify({ student: "Wei" }) },
    });

    // Then the execution walked the definition the template carried, to the
    // end.
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(
      described.output,
      JSON.stringify({ student: "Wei", outcome: { enrolled: true } }),
    );
  });

  it("answers a Ref with the ARN and the attributes with the ARN and name", async () => {
    // Given a template reading its state machine every way the Resource
    // publishes.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "enrolment",
      template: workflowTemplate({
        StateMachineName: "Enrolment",
        RoleArn: roleArn,
        DefinitionString: JSON.stringify(passChain),
      }),
    });
    await stack.waitForDeployComplete();

    // Then the Ref is the ARN, which is the way round real CloudFormation
    // publishes this one, and the attributes are the ARN and the name.
    const expectedArn = `arn:aws:states:${simAws.defaultRegionName}:${simAws.defaultAccountId}:stateMachine:Enrolment`;

    assertIdentical(stack.outputs.get("WorkflowRef")?.value, expectedArn);
    assertIdentical(stack.outputs.get("WorkflowArn")?.value, expectedArn);
    assertIdentical(stack.outputs.get("WorkflowName")?.value, "Enrolment");
  });

  it("names an unnamed state machine after the stack and the logical ID", async () => {
    // Given a template that names no state machine, which is what CDK emits
    // for a StateMachine with no stateMachineName.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "enrolment",
      template: workflowTemplate({
        RoleArn: roleArn,
        DefinitionString: JSON.stringify(passChain),
      }),
    });
    await stack.waitForDeployComplete();

    // Then CloudFormation named it, as real CloudFormation does.
    assertIdentical(
      stack.outputs.get("WorkflowName")?.value,
      "enrolment-Workflow",
    );
  });

  it("carries the role and the type across to the state machine", async () => {
    // Given a template declaring an express workflow running as a named Role.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "enrolment",
      template: workflowTemplate({
        StateMachineName: "Enrolment",
        RoleArn: roleArn,
        StateMachineType: "EXPRESS",
        DefinitionString: JSON.stringify(passChain),
      }),
    });
    await stack.waitForDeployComplete();

    // Then DescribeStateMachine answers with both, along with the definition
    // as the template wrote it.
    const stateMachineArn = stack.outputs.get("WorkflowArn")?.value;
    assertTypeString(stateMachineArn);

    const described = await simAws
      .stepFunctions()
      .describeStateMachine({ input: { stateMachineArn } });

    assertIdentical(described.roleArn, roleArn);
    assertIdentical(described.type, "EXPRESS");
    assertIdentical(described.definition, JSON.stringify(passChain));
  });

  it("records the properties it deployed the state machine without", async () => {
    // Given a template asking for logging, tracing and encryption, none of
    // which this simulation gives a state machine any behaviour for.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "enrolment",
      template: workflowTemplate({
        StateMachineName: "Enrolment",
        RoleArn: roleArn,
        DefinitionString: JSON.stringify(passChain),
        LoggingConfiguration: { Level: "ALL" },
        TracingConfiguration: { Enabled: true },
        EncryptionConfiguration: { Type: "AWS_OWNED_KEY" },
      }),
    });
    await stack.waitForDeployComplete();

    // Then the state machine is there, and what it was created without is
    // recorded where a test can find it rather than failing the stack.
    assertIdentical(
      simAws.stepFunctions().findStateMachine("Enrolment")?.name,
      "Enrolment",
    );

    const ignoredPaths = stack.ignoredProperties.map(
      (property) => property.path,
    );
    assertIdentical(
      ignoredPaths.join(", "),
      "LoggingConfiguration, TracingConfiguration, EncryptionConfiguration",
    );
  });

  it("deletes the state machine when the stack is deleted", async () => {
    // Given a deployed state machine.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "enrolment",
      template: workflowTemplate({
        StateMachineName: "Enrolment",
        RoleArn: roleArn,
        DefinitionString: JSON.stringify(passChain),
      }),
    });
    await stack.waitForDeployComplete();

    const stateMachineArn = stack.outputs.get("WorkflowArn")?.value;
    assertTypeString(stateMachineArn);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the state machine has gone with it, and the Resource says so.
    assertIdentical(stack.getResource("Workflow")?.status, "DELETE_COMPLETE");
    assertUndefined(simAws.stepFunctions().findStateMachine("Enrolment"));

    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .stepFunctions()
        .describeStateMachine({ input: { stateMachineArn } });
    });
    assertInstanceOf(error, SimStatesResourceNotFound);
  });
});
