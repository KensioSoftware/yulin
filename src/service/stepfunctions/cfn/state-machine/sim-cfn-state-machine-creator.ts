import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimStateMachine } from "../../machine/sim-state-machine.js";
import type { SimStatesDefinitionStore } from "../../definition/store/sim-states-definition-store.js";
import type { SimStepFunctions } from "../../sim-step-functions.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnStateMachineProperties } from "./sim-cfn-state-machine-properties.js";
import { simCfnStepFunctionsResourceCommand } from "../sim-cfn-step-functions-resource-error.js";
import { stateMachineResourceType } from "../sim-cfn-step-functions-resource-types.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnStateMachineCreatorProperties {
  readonly stepFunctions: SimStepFunctions;

  /** Where a `DefinitionS3Location` is read from. */
  readonly definitions: SimStatesDefinitionStore;
}

/**
 * Creates simulated state machines from AWS::StepFunctions::StateMachine
 * Resources.
 *
 * The state machine goes through the ordinary CreateStateMachine command
 * rather than being constructed directly, so one a template deployed is the
 * same thing an SDK caller would have got. The name rules, the definition
 * checks and the refusals for what this simulation does not run are all the
 * same either way.
 */
export class SimCfnStateMachineCreator {
  readonly #stepFunctions: SimStepFunctions;
  readonly #definitions: SimStatesDefinitionStore;

  constructor(properties: SimCfnStateMachineCreatorProperties) {
    this.#stepFunctions = properties.stepFunctions;
    this.#definitions = properties.definitions;
  }

  /**
   * Create a state machine from an AWS::StepFunctions::StateMachine Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimStateMachine> {
    const stateMachineProperties = new SimCfnStateMachineProperties({
      resource,
      properties,
      definitions: this.#definitions,
    });
    const name = stateMachineProperties.name();
    const roleArn = stateMachineProperties.roleArn();
    const type = stateMachineProperties.type();
    const tags = stateMachineProperties.tags();
    const definition = await stateMachineProperties.definition();

    return await simCfnStepFunctionsResourceCommand(
      stateMachineResourceType,
      resource.logicalId,
      async () => {
        await this.#stepFunctions.createStateMachine(
          {
            input: {
              name,
              definition,
              roleArn,
              tags,
              ...(type !== undefined && { type }),
            },
          },
          options,
        );

        const stateMachine = this.#stepFunctions.findStateMachine(name);
        assertDefined(
          stateMachine,
          `sim state machine ${name} after CloudFormation creation`,
        );

        return stateMachine;
      },
    );
  }
}
