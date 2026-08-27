import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimStateMachine } from "../machine/sim-state-machine.js";
import type { SimStepFunctions } from "../sim-step-functions.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import { stateMachineResourceTypeName } from "./sim-cfn-step-functions-resource-types.js";
import type { SimCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnStepFunctionsResourceDeleterProperties {
  readonly stepFunctions: SimStepFunctions;
}

/**
 * Deletes the simulated Step Functions resources a CloudFormation Stack
 * created.
 */
export class SimCfnStepFunctionsResourceDeleter {
  readonly #stepFunctions: SimStepFunctions;

  constructor(properties: SimCfnStepFunctionsResourceDeleterProperties) {
    this.#stepFunctions = properties.stepFunctions;
  }

  /**
   * Delete a simulated Step Functions resource created from a CloudFormation
   * Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    if (resourceTypeName !== stateMachineResourceTypeName) {
      throw new Error(
        `Unsupported sim StepFunctions CloudFormation Resource ` +
          `${resourceTypeName} deletion`,
      );
    }

    const stateMachine = resource.simResource as SimStateMachine | undefined;
    assertDefined(
      stateMachine,
      `sim state machine for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.#stepFunctions.deleteStateMachine(
      { input: { stateMachineArn: stateMachine.arn } },
      options,
    );
  }
}
