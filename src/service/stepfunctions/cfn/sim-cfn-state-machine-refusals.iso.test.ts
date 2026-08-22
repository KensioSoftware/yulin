import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  simStatesRunnableTypes,
  simStatesStateTypes,
} from "../definition/sim-states-state.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";

describe("What a deployed AWS::StepFunctions::StateMachine refuses", () => {
  const roleArn = "arn:aws:iam::123456789012:role/EnrolmentWorkflowRole";

  /**
   * A stack holding a queue beside the workflow, so a dropped state machine
   * can be told apart from a stack that did not deploy.
   */
  function template(
    resources: SimCfnTemplateValueRecord,
  ): CfnTemplateBodyRecord {
    return {
      Resources: {
        OrdersQueue: { Type: "AWS::SQS::Queue", Properties: {} },
        ...resources,
      },
    };
  }

  function workflowTemplate(
    properties: SimCfnTemplateValueRecord,
  ): CfnTemplateBodyRecord {
    return template({
      Workflow: {
        Type: "AWS::StepFunctions::StateMachine",
        Properties: properties,
      },
    });
  }

  /**
   * Deploy a template, giving back whatever the deployment was refused with.
   */
  async function refusalFrom(body: CfnTemplateBodyRecord): Promise<Error> {
    const simAws = new SimAws();

    return await assertThrowsErrorAsync(async () => {
      const stack = await simAws
        .cloudFormation()
        .deployTemplate({ stackName: "enrolment", template: body });
      await stack.waitForDeployComplete();
    });
  }

  /**
   * Deploy a template that is expected to complete, whatever it had to drop.
   */
  async function deploy(
    body: CfnTemplateBodyRecord,
  ): Promise<{ readonly simAws: SimAws; readonly stack: SimCfnDeployedStack }> {
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "enrolment", template: body });
    await stack.waitForDeployComplete();

    return { simAws, stack };
  }

  /**
   * A state type Amazon States Language defines and this simulator has no
   * implementation for.
   *
   * Read from Step Functions' own two lists rather than named here. The
   * interpreter keeps taking state types on, and a test naming one starts
   * failing the day that one lands.
   */
  function unrunStateType(): string {
    const type = simStatesStateTypes.find(
      (candidate) => !simStatesRunnableTypes.includes(candidate as never),
    );
    assertNonNullable(type);

    return type;
  }

  it("drops a state machine using a state the interpreter does not run", async () => {
    // Given a workflow holding a state type this simulator has no
    // implementation for yet.
    const stateType = unrunStateType();
    const body = workflowTemplate({
      StateMachineName: "Enrolment",
      RoleArn: roleArn,
      DefinitionString: JSON.stringify({
        StartAt: "Step",
        States: {
          Step: { Type: stateType, Next: "Done" },
          Done: { Type: "Succeed" },
        },
      }),
    });

    // When the stack is deployed.
    const { simAws, stack } = await deploy(body);

    // Then that one state machine is dropped, with the reason on the Stack,
    // and everything else in the stack still deployed.
    assertUndefined(simAws.stepFunctions().findStateMachine("Enrolment"));
    assertArrayLength(stack.skippedResources, 1);

    const skipped = stack.skippedResources[0];
    assertNonNullable(skipped);
    assertTrue(skipped.skipped);
    assertIdentical(skipped.logicalId, "Workflow");
    assertStringIncludes(
      skipped.skippedReason ?? "",
      `is a ${stateType} state`,
    );
    assertIdentical(
      stack.getResource("OrdersQueue")?.status,
      "CREATE_COMPLETE",
    );
  });

  it("drops a state machine whose definition is an object in a bucket", async () => {
    // Given a definition CDK published as an asset, which this simulation does
    // not fetch.
    const body = workflowTemplate({
      StateMachineName: "Enrolment",
      RoleArn: roleArn,
      DefinitionS3Location: { Bucket: "assets", Key: "workflow.asl.json" },
    });

    // When the stack is deployed.
    const { simAws, stack } = await deploy(body);

    // Then the state machine is dropped and recorded, rather than deployed
    // without the definition it was meant to run.
    assertUndefined(simAws.stepFunctions().findStateMachine("Enrolment"));
    assertStringIncludes(
      stack.skippedResources[0]?.skippedReason ?? "",
      "DefinitionS3Location",
    );
  });

  it("drops a version or an alias of a state machine", async () => {
    // Given a template publishing a version of its workflow and pointing an
    // alias at it, neither of which this simulation models.
    const body = template({
      Version: {
        Type: "AWS::StepFunctions::StateMachineVersion",
        Properties: { StateMachineArn: "arn:aws:states:::stateMachine:Any" },
      },
      Live: {
        Type: "AWS::StepFunctions::StateMachineAlias",
        Properties: { Name: "live" },
      },
    });

    // When the stack is deployed.
    const { stack } = await deploy(body);

    // Then both are recorded as unsupported and stepped over.
    const reasons = stack.skippedResources.map(
      (resource) => resource.skippedReason,
    );
    assertIdentical(
      reasons.join("\n"),
      "Unsupported sim StepFunctions CloudFormation Resource StateMachineVersion\n" +
        "Unsupported sim StepFunctions CloudFormation Resource StateMachineAlias",
    );
  });

  it("refuses a definition Amazon States Language itself refuses", async () => {
    // When a template starts its workflow at a state it does not declare.
    const error = await refusalFrom(
      workflowTemplate({
        StateMachineName: "Enrolment",
        RoleArn: roleArn,
        DefinitionString: JSON.stringify({
          StartAt: "Missing",
          States: { Done: { Type: "Succeed" } },
        }),
      }),
    );

    // Then the deployment is refused in the words CreateStateMachine refuses
    // it in, with the Resource named so the template can be found.
    assertStringIncludes(error.message, "Workflow");
    assertStringIncludes(error.message, "StartAt names Missing");
  });

  it("refuses a state machine name Step Functions would not accept", async () => {
    // When a template names its workflow with a character Step Functions
    // refuses.
    const error = await refusalFrom(
      workflowTemplate({
        StateMachineName: "Enrolment/Live",
        RoleArn: roleArn,
        DefinitionString: JSON.stringify({
          StartAt: "Done",
          States: { Done: { Type: "Succeed" } },
        }),
      }),
    );

    // Then the deployment is refused rather than deploying a state machine
    // nothing could reach by the name the template used.
    assertStringIncludes(error.message, "does not allow in a name");
  });

  it("refuses a state machine carrying no definition", async () => {
    // When a template declares a workflow with nothing to run.
    const error = await refusalFrom(
      workflowTemplate({ StateMachineName: "Enrolment", RoleArn: roleArn }),
    );

    // Then the deployment is refused, as real CloudFormation refuses it.
    assertStringIncludes(
      error.message,
      "a state machine needs a DefinitionString or a Definition",
    );
  });

  it("refuses a state machine carrying both forms of definition", async () => {
    // When a template writes the definition twice, once each way.
    const done = { StartAt: "Done", States: { Done: { Type: "Succeed" } } };
    const error = await refusalFrom(
      workflowTemplate({
        StateMachineName: "Enrolment",
        RoleArn: roleArn,
        DefinitionString: JSON.stringify(done),
        Definition: done,
      }),
    );

    // Then the deployment is refused rather than one of them being picked.
    assertStringIncludes(error.message, "two ways of writing the same thing");
  });

  it("refuses a state machine with no Role to run as", async () => {
    // When a template leaves out the RoleArn the Resource requires.
    const error = await refusalFrom(
      workflowTemplate({
        StateMachineName: "Enrolment",
        DefinitionString: JSON.stringify({
          StartAt: "Done",
          States: { Done: { Type: "Succeed" } },
        }),
      }),
    );

    // Then the deployment is refused rather than a Role being invented.
    assertStringIncludes(error.message, "a state machine needs a RoleArn");
  });

  it("refuses a state machine type Step Functions does not have", async () => {
    // When a template asks for a third kind of state machine.
    const error = await refusalFrom(
      workflowTemplate({
        StateMachineName: "Enrolment",
        RoleArn: roleArn,
        StateMachineType: "SYNCHRONOUS",
        DefinitionString: JSON.stringify({
          StartAt: "Done",
          States: { Done: { Type: "Succeed" } },
        }),
      }),
    );

    // Then the deployment is refused in the words CreateStateMachine refuses
    // it in.
    assertStringIncludes(error.message, "It is STANDARD or EXPRESS");
  });
});
