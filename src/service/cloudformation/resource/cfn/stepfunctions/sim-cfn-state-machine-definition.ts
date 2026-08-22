import { isRecord } from "../../../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import {
  simCfnStepFunctionsResourceError,
  simCfnStepFunctionsSkippedResourceError,
} from "./sim-cfn-step-functions-resource-error.js";
import {
  definitionPropertyName,
  definitionS3LocationPropertyName,
  definitionStringPropertyName,
  definitionSubstitutionsPropertyName,
} from "./sim-cfn-state-machine-property-names.js";
import { SimCfnStateMachineSubstitutions } from "./sim-cfn-state-machine-substitutions.js";
import { stateMachineResourceType } from "./sim-cfn-step-functions-resource-types.js";

interface SimCfnStateMachineDefinitionProperties {
  readonly logicalId: string;
  readonly properties: ReadonlyMap<string, SimCfnTemplateValue>;
}

/**
 * Reads the Amazon States Language a state machine Resource carries.
 *
 * A template writes the definition one of three ways. `DefinitionString` holds
 * it as a string. CDK emits that form, as an `Fn::Join` over the ARNs of the
 * Resources the workflow reaches, and the join has resolved by the time this
 * reads it. `Definition` holds the same document as template data, the form a
 * hand-written YAML template tends to use. `DefinitionS3Location` points at an
 * object in a bucket, and this simulation does not fetch one.
 */
export class SimCfnStateMachineDefinition {
  readonly #logicalId: string;
  readonly #properties: ReadonlyMap<string, SimCfnTemplateValue>;

  constructor(properties: SimCfnStateMachineDefinitionProperties) {
    this.#logicalId = properties.logicalId;
    this.#properties = properties.properties;
  }

  /**
   * The definition to create the state machine from, with any substitutions
   * applied.
   */
  value(): string {
    return new SimCfnStateMachineSubstitutions({
      logicalId: this.#logicalId,
      declared: this.#properties.get(definitionSubstitutionsPropertyName),
    }).applyTo(this.declared());
  }

  /**
   * The definition as the template wrote it, before substitution.
   */
  private declared(): string {
    const definitionString = this.#properties.get(definitionStringPropertyName);
    const definition = this.#properties.get(definitionPropertyName);

    if (definitionString !== undefined && definition !== undefined) {
      throw this.definitionError(
        `${definitionStringPropertyName} and ${definitionPropertyName} are ` +
          "two ways of writing the same thing, and a Resource carries one",
      );
    }

    if (definitionString !== undefined) {
      return this.readDefinitionString(definitionString);
    }

    if (definition !== undefined) {
      return this.readDefinition(definition);
    }

    return this.missingDefinition();
  }

  /**
   * The string form, which an `Fn::Join` resolves to.
   */
  private readDefinitionString(definitionString: SimCfnTemplateValue): string {
    if (typeof definitionString !== "string") {
      throw this.definitionError(
        `${definitionStringPropertyName} must be a string`,
      );
    }

    return definitionString;
  }

  /**
   * The object form, holding the same document as template data.
   */
  private readDefinition(definition: SimCfnTemplateValue): string {
    if (!isRecord(definition)) {
      throw this.definitionError(`${definitionPropertyName} must be an object`);
    }

    return JSON.stringify(definition);
  }

  /**
   * What a Resource carrying no definition this simulation reads is refused
   * with.
   *
   * A definition in S3 is skipped and the Resource carries on being reported.
   * The asset is published by the CDK bootstrap machinery this simulator has
   * no part in, so a template pointing at one is asking for something absent.
   * A Resource written wrongly is a different thing, and fails.
   */
  private missingDefinition(): never {
    if (this.#properties.has(definitionS3LocationPropertyName)) {
      throw simCfnStepFunctionsSkippedResourceError(
        stateMachineResourceType,
        this.#logicalId,
        `${definitionS3LocationPropertyName} points at an object in a bucket, ` +
          "which this simulation does not fetch a definition from",
      );
    }

    throw this.definitionError(
      `a state machine needs a ${definitionStringPropertyName} or a ${
        definitionPropertyName
      }`,
    );
  }

  private definitionError(reason: string): Error {
    return simCfnStepFunctionsResourceError(
      stateMachineResourceType,
      this.#logicalId,
      reason,
    );
  }
}
