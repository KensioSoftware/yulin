import {
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimStateMachine } from "../machine/sim-state-machine.js";
import { SimStateMachineTags } from "../machine/sim-state-machine-tags.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimStateMachineCfn } from "../../cloudformation/resource/cfn/stepfunctions/sim-state-machine-cfn.js";

describe("What an AWS::StepFunctions::StateMachine Resource shape refuses", () => {
  const roleArn = "arn:aws:iam::123456789012:role/EnrolmentWorkflowRole";

  const done = { StartAt: "Done", States: { Done: { Type: "Succeed" } } };

  /**
   * Deploy a workflow declared with the given properties, giving back whatever
   * the deployment was refused with.
   */
  async function refusalFrom(
    properties: SimCfnTemplateValueRecord,
  ): Promise<Error> {
    const simAws = new SimAws();

    return await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "enrolment",
        template: {
          Resources: {
            Workflow: {
              Type: "AWS::StepFunctions::StateMachine",
              Properties: { RoleArn: roleArn, ...properties },
            },
          },
        },
      });
      await stack.waitForDeployComplete();
    });
  }

  it("refuses a DefinitionString that is not a string", async () => {
    // When a template writes the string form as a number.
    const error = await refusalFrom({ DefinitionString: 42 });

    // Then the deployment is refused, saying which property is wrong.
    assertStringIncludes(error.message, "DefinitionString must be a string");
  });

  it("refuses a Definition that is not an object", async () => {
    // When a template writes the object form as a string.
    const error = await refusalFrom({ Definition: JSON.stringify(done) });

    // Then the deployment is refused rather than the string being read as ASL,
    // since the two properties are written differently on purpose.
    assertStringIncludes(error.message, "Definition must be an object");
  });

  it("refuses a StateMachineName that is not a string", async () => {
    // When a template writes a name as a list.
    const error = await refusalFrom({
      StateMachineName: ["Enrolment"],
      Definition: done,
    });

    // Then the deployment is refused.
    assertStringIncludes(error.message, "StateMachineName must be a string");
  });

  it("refuses a RoleArn that is not a string", async () => {
    // When a template writes the Role as an object.
    const error = await refusalFrom({
      RoleArn: { Ref: "WorkflowRole" },
      Definition: done,
    });

    // Then the deployment is refused. An unresolved Ref arrives here as the
    // object it was written as, which is the shape this catches.
    assertStringIncludes(error.message, "RoleArn must be a string");
  });

  it("refuses a StateMachineType that is not a string", async () => {
    // When a template writes the type as a number.
    const error = await refusalFrom({ StateMachineType: 1, Definition: done });

    // Then the deployment is refused.
    assertStringIncludes(error.message, "StateMachineType must be a string");
  });

  it("refuses DefinitionSubstitutions that are not an object", async () => {
    // When a template writes the substitutions as a list of pairs.
    const error = await refusalFrom({
      DefinitionString: JSON.stringify(done),
      DefinitionSubstitutions: [{ Key: "Queue", Value: "orders" }],
    });

    // Then the deployment is refused.
    assertStringIncludes(
      error.message,
      "DefinitionSubstitutions must be an object",
    );
  });

  it("refuses a substitution value a definition could not hold as text", async () => {
    // When a substitution stands for a whole object.
    const error = await refusalFrom({
      DefinitionString: JSON.stringify(done),
      DefinitionSubstitutions: { Queue: { Arn: "arn:aws:sqs:::orders" } },
    });

    // Then the deployment is refused rather than the definition being given
    // something stringified into it.
    assertStringIncludes(
      error.message,
      "DefinitionSubstitutions.Queue must be a string, a number or a boolean",
    );
  });

  it("refuses an attribute the Resource does not publish", () => {
    // Given a deployed state machine's CloudFormation-facing values.
    const values = new SimStateMachineCfn(
      new SimStateMachine({
        arn: "arn:aws:states:eu-west-2:111111111111:stateMachine:Enrolment",
        name: "Enrolment",
        roleArn,
        definition: JSON.stringify(done),
        parsed: { StartAt: "Done", States: new Map() },
        type: "STANDARD",
        creationDate: new Date(0),
        tags: SimStateMachineTags.fromInput([]),
      }),
    );

    // When a template reads an attribute the Resource has no value for.
    const error = assertThrowsError(() =>
      values.attributeValue("StateMachineRevisionId"),
    );

    // Then it is refused by name rather than answered with a stand-in.
    assertStringIncludes(error.message, "StateMachineRevisionId");
  });
});
