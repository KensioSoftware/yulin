import type { SimCfnResource } from "../../sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { SimCfnStateMachineDefinition } from "./sim-cfn-state-machine-definition.js";
import { SimCfnStateMachineName } from "./sim-cfn-state-machine-name.js";
import {
  roleArnPropertyName,
  stateMachineNamePropertyName,
  stateMachineTypePropertyName,
  unsimulatedPropertyReasons,
} from "./sim-cfn-state-machine-property-names.js";
import { simCfnStepFunctionsResourceError } from "./sim-cfn-step-functions-resource-error.js";
import { stateMachineResourceType } from "./sim-cfn-step-functions-resource-types.js";

interface SimCfnStateMachinePropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::StepFunctions::StateMachine CloudFormation properties into the
 * shapes the Step Functions commands take.
 *
 * What a definition may hold is decided by simulated Step Functions rather
 * than here, so a state type it does not run is refused by the command that
 * reads it. What this reads is the shape. A property that has to be a string
 * or an object is checked for being one, since a template that put an object
 * where a role ARN goes has made a mistake CreateStateMachine cannot explain.
 */
export class SimCfnStateMachineProperties {
  readonly #resource: SimCfnResource;
  readonly #properties: ReadonlyMap<string, SimCfnTemplateValue>;

  constructor(properties: SimCfnStateMachinePropertiesProperties) {
    this.#resource = properties.resource;
    this.#properties = new Map(Object.entries(properties.properties));

    this.recordUnsimulated();
  }

  /**
   * The state machine name.
   *
   * An unnamed state machine is named after the stack and the logical ID, as
   * real CloudFormation names one.
   */
  name(): string {
    const name = this.#properties.get(stateMachineNamePropertyName);

    if (name === undefined) {
      return new SimCfnStateMachineName({
        stackName: this.#resource.stackName,
        logicalId: this.#resource.logicalId,
      }).value;
    }

    return this.string(stateMachineNamePropertyName, name);
  }

  /**
   * The Role an execution runs as.
   *
   * Required on the real Resource, and required by `CreateStateMachine`, so a
   * template leaving it out is refused rather than given one.
   */
  roleArn(): string {
    const roleArn = this.#properties.get(roleArnPropertyName);

    if (roleArn === undefined) {
      throw this.propertyError(
        `a state machine needs a ${roleArnPropertyName}`,
      );
    }

    return this.string(roleArnPropertyName, roleArn);
  }

  /**
   * Whether the state machine is STANDARD or EXPRESS, when the template says.
   *
   * Which of the two it is, is decided by `CreateStateMachine`, so a template
   * asking for a third thing is refused in the words that command refuses it
   * in.
   */
  type(): string | undefined {
    const type = this.#properties.get(stateMachineTypePropertyName);

    if (type === undefined) {
      return undefined;
    }

    return this.string(stateMachineTypePropertyName, type);
  }

  /**
   * The Amazon States Language the state machine runs.
   */
  definition(): string {
    return new SimCfnStateMachineDefinition({
      logicalId: this.#resource.logicalId,
      properties: this.#properties,
    }).value();
  }

  /**
   * A property that has to be a string.
   */
  private string(name: string, value: SimCfnTemplateValue): string {
    if (typeof value !== "string") {
      throw this.propertyError(`${name} must be a string`);
    }

    return value;
  }

  /**
   * Record the properties this simulation gives no behaviour to.
   */
  private recordUnsimulated(): void {
    for (const [name, reason] of unsimulatedPropertyReasons) {
      if (this.#properties.has(name)) {
        this.#resource.ignoreProperty(name, reason);
      }
    }
  }

  private propertyError(reason: string): Error {
    return simCfnStepFunctionsResourceError(
      stateMachineResourceType,
      this.#resource.logicalId,
      reason,
    );
  }
}
