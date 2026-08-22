import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimStatesTagInput } from "../../machine/sim-state-machine-tag.js";
import { simCfnStepFunctionsResourceError } from "../sim-cfn-step-functions-resource-error.js";
import { tagsPropertyName } from "./sim-cfn-state-machine-property-names.js";
import { stateMachineResourceType } from "../sim-cfn-step-functions-resource-types.js";

interface SimCfnStateMachineTagsProperties {
  readonly logicalId: string;
  readonly declared: SimCfnTemplateValue | undefined;
}

/**
 * Reads the `Tags` a state machine Resource carries.
 *
 * CloudFormation writes a tag as `Key` and `Value`, where the Step Functions
 * API writes it as `key` and `value`. The two names for one tag meet here, and
 * what a key or a value may hold is decided by `CreateStateMachine`, so a tag
 * a template wrote is held to what a tag from `TagResource` is.
 */
export class SimCfnStateMachineTags {
  readonly #logicalId: string;
  readonly #declared: SimCfnTemplateValue | undefined;

  constructor(properties: SimCfnStateMachineTagsProperties) {
    this.#logicalId = properties.logicalId;
    this.#declared = properties.declared;
  }

  /**
   * The tags to create the state machine with.
   */
  value(): readonly SimStatesTagInput[] {
    if (this.#declared === undefined) {
      return [];
    }

    if (!Array.isArray(this.#declared)) {
      throw this.error(`${tagsPropertyName} must be a list`);
    }

    return this.#declared.map((entry, index) => this.tag(entry, index));
  }

  /**
   * One entry of the list, which carries a key and a value.
   */
  private tag(entry: SimCfnTemplateValue, index: number): SimStatesTagInput {
    const at = `${tagsPropertyName}[${index.toString()}]`;

    if (!isRecord(entry)) {
      throw this.error(`${at} must be an object`);
    }

    return {
      key: this.member(entry["Key"], `${at}.Key`),
      value: this.member(entry["Value"], `${at}.Value`),
    };
  }

  /**
   * One half of a tag, which has to be a string.
   */
  private member(value: SimCfnTemplateValue | undefined, at: string): string {
    if (typeof value !== "string") {
      throw this.error(`${at} must be a string`);
    }

    return value;
  }

  private error(reason: string): Error {
    return simCfnStepFunctionsResourceError(
      stateMachineResourceType,
      this.#logicalId,
      reason,
    );
  }
}
