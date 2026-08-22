import { isRecord } from "../../../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import { simCfnStepFunctionsResourceError } from "./sim-cfn-step-functions-resource-error.js";
import { definitionSubstitutionsPropertyName } from "./sim-cfn-state-machine-property-names.js";
import { stateMachineResourceType } from "./sim-cfn-step-functions-resource-types.js";

interface SimCfnStateMachineSubstitutionsProperties {
  readonly logicalId: string;
  readonly declared: SimCfnTemplateValue | undefined;
}

/**
 * Applies `DefinitionSubstitutions` to a state machine definition.
 *
 * Each entry replaces every `${Key}` in the definition with its value, which is
 * how real Step Functions reads them. The values arrive already resolved, so a
 * substitution holding a `Ref` is the ARN by the time it lands here.
 */
export class SimCfnStateMachineSubstitutions {
  readonly #logicalId: string;
  readonly #declared: SimCfnTemplateValue | undefined;

  constructor(properties: SimCfnStateMachineSubstitutionsProperties) {
    this.#logicalId = properties.logicalId;
    this.#declared = properties.declared;
  }

  /**
   * The definition with every placeholder replaced.
   */
  applyTo(definition: string): string {
    let substituted = definition;

    for (const [key, value] of this.entries()) {
      substituted = substituted.split(`\${${key}}`).join(this.text(key, value));
    }

    return substituted;
  }

  /**
   * The substitutions the template declared, as key and value pairs.
   */
  private entries(): readonly (readonly [string, SimCfnTemplateValue])[] {
    if (this.#declared === undefined) {
      return [];
    }

    if (!isRecord(this.#declared)) {
      throw this.error(
        `${definitionSubstitutionsPropertyName} must be an object`,
      );
    }

    return Object.entries(this.#declared);
  }

  /**
   * One substitution value, which has to be something a definition can hold as
   * text.
   */
  private text(key: string, value: SimCfnTemplateValue): string {
    if (value === null || typeof value === "object") {
      throw this.error(
        `${definitionSubstitutionsPropertyName}.${key} must be a string, a ` +
          "number or a boolean",
      );
    }

    return String(value);
  }

  private error(reason: string): Error {
    return simCfnStepFunctionsResourceError(
      stateMachineResourceType,
      this.#logicalId,
      reason,
    );
  }
}
