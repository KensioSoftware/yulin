import type { SimStatesDefinitionStore } from "../definition/store/sim-states-definition-store.js";
import type { SimStepFunctions } from "../sim-step-functions.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceDeleteContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import { SimCfnStateMachineCreator } from "./state-machine/sim-cfn-state-machine-creator.js";
import { SimCfnStepFunctionsResourceDeleter } from "./sim-cfn-step-functions-resource-deleter.js";
import { stateMachineResourceTypeName } from "./sim-cfn-step-functions-resource-types.js";

interface SimStepFunctionsCfnResourceFactoryProperties {
  readonly stepFunctions: SimStepFunctions;

  /** Where a `DefinitionS3Location` is read from. */
  readonly definitions: SimStatesDefinitionStore;
}

/**
 * CloudFormation Resource factory for simulated Step Functions resources.
 */
export class SimStepFunctionsCfnResourceFactory implements SimCfnServiceResourceFactory {
  readonly #stateMachineCreator: SimCfnStateMachineCreator;
  readonly #deleter: SimCfnStepFunctionsResourceDeleter;

  constructor(properties: SimStepFunctionsCfnResourceFactoryProperties) {
    this.#stateMachineCreator = new SimCfnStateMachineCreator({
      stepFunctions: properties.stepFunctions,
      definitions: properties.definitions,
    });
    this.#deleter = new SimCfnStepFunctionsResourceDeleter({
      stepFunctions: properties.stepFunctions,
    });
  }

  /**
   * Create a simulated Step Functions resource from a CloudFormation Resource.
   *
   * The state machine is the one AWS::StepFunctions::* Resource type this
   * simulation models. `StateMachineVersion` publishes an immutable copy of a
   * definition and `StateMachineAlias` routes executions between versions, and
   * neither has anything to act on while every execution runs the definition
   * the state machine currently holds. Both are reported as unsupported and
   * skipped rather than quietly treated as deployed.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    if (resourceTypeName !== stateMachineResourceTypeName) {
      throw new Error(
        `Unsupported sim StepFunctions CloudFormation Resource ${resourceTypeName}`,
      );
    }

    return await this.#stateMachineCreator.create(
      resource,
      context.resolvedProperties ?? resource.properties,
    );
  }

  /**
   * Delete a simulated Step Functions resource created from a CloudFormation
   * Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    _context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    await this.#deleter.delete(resourceTypeName, resource);
  }
}
