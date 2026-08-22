import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import { simCfnStepFunctionsResourceCommand } from "./sim-cfn-step-functions-resource-error.js";
import type { SimStepFunctionsCfnResourceFactory } from "./sim-step-functions-cfn-resource-factory.js";

describe("What the simulated Step Functions CloudFormation factory refuses", () => {
  /**
   * The factory, and a Resource for it to be asked about.
   */
  function factoryAndResource(type: string): {
    readonly simAws: SimAws;
    readonly factory: SimStepFunctionsCfnResourceFactory;
    readonly resource: SimCfnResource;
  } {
    const simAws = new SimAws();

    return {
      simAws,
      factory: simAws.stepFunctions().cfnResourceFactory(),
      resource: new SimCfnResource({
        logicalId: "Live",
        stackName: "enrolment",
        template: { Type: `AWS::StepFunctions::${type}` },
      }),
    };
  }

  it("refuses creating a Step Functions Resource type it does not simulate", async () => {
    // Given the factory, and an alias pointing at a published version.
    const { simAws, factory, resource } =
      factoryAndResource("StateMachineAlias");

    // When the factory is asked for it.
    const error = await assertThrowsErrorAsync(async () => {
      await factory.create("StateMachineAlias", resource, {
        simAws,
        resources: new Map(),
      });
    });

    // Then it says so, which sim CloudFormation records and steps over.
    assertStringIncludes(
      error.message,
      "Unsupported sim StepFunctions CloudFormation Resource StateMachineAlias",
    );
  });

  it("refuses deleting a Step Functions Resource type it never creates", async () => {
    // Given the factory, and a published version.
    const { simAws, factory, resource } = factoryAndResource(
      "StateMachineVersion",
    );

    // When the factory is asked to delete it.
    const error = await assertThrowsErrorAsync(async () => {
      await factory.delete("StateMachineVersion", resource, {
        simAws,
        resources: new Map(),
      });
    });

    // Then it says so.
    assertStringIncludes(
      error.message,
      "Unsupported sim StepFunctions CloudFormation Resource " +
        "StateMachineVersion deletion",
    );
  });

  it("passes through an error that did not come from simulated Step Functions", async () => {
    // Given a creation that fails for a reason of its own.
    const thrown = new TypeError("the template reader broke");

    // When it runs inside the wrapper that renames Step Functions refusals.
    const error = await assertThrowsErrorAsync(async () => {
      await simCfnStepFunctionsResourceCommand(
        "AWS::StepFunctions::StateMachine",
        "Workflow",
        () => Promise.reject(thrown),
      );
    });

    // Then it comes back as it was, since only Step Functions' own refusals
    // are reworded to name the Resource.
    assertIdentical(error, thrown);
  });
});
