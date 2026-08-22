import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimStatesDefinitionStore } from "../../definition/store/sim-states-definition-store.js";
import { simCfnStepFunctionsResourceError } from "../sim-cfn-step-functions-resource-error.js";
import {
  definitionPropertyName,
  definitionS3LocationPropertyName,
  definitionStringPropertyName,
  definitionSubstitutionsPropertyName,
} from "./sim-cfn-state-machine-property-names.js";
import { SimCfnStateMachineS3Definition } from "./sim-cfn-state-machine-s3-definition.js";
import { SimCfnStateMachineSubstitutions } from "./sim-cfn-state-machine-substitutions.js";
import { stateMachineResourceType } from "../sim-cfn-step-functions-resource-types.js";

interface SimCfnStateMachineDefinitionProperties {
  readonly logicalId: string;
  readonly properties: ReadonlyMap<string, SimCfnTemplateValue>;
  readonly definitions: SimStatesDefinitionStore;
}

/**
 * Reads the Amazon States Language a state machine Resource carries.
 *
 * A template writes the definition one of three ways. `DefinitionString` holds
 * it as a string. CDK emits that form, as an `Fn::Join` over the ARNs of the
 * Resources the workflow reaches, and the join has resolved by the time this
 * reads it. `Definition` holds the same document as template data, the form a
 * hand-written YAML template tends to use. `DefinitionS3Location` points at an
 * object in a bucket, which is fetched from simulated S3.
 */
export class SimCfnStateMachineDefinition {
  readonly #logicalId: string;
  readonly #properties: ReadonlyMap<string, SimCfnTemplateValue>;
  readonly #s3Definition: SimCfnStateMachineS3Definition;

  constructor(properties: SimCfnStateMachineDefinitionProperties) {
    this.#logicalId = properties.logicalId;
    this.#properties = properties.properties;
    this.#s3Definition = new SimCfnStateMachineS3Definition({
      logicalId: properties.logicalId,
      definitions: properties.definitions,
    });
  }

  /**
   * The definition to create the state machine from, with any substitutions
   * applied.
   */
  async value(): Promise<string> {
    return new SimCfnStateMachineSubstitutions({
      logicalId: this.#logicalId,
      declared: this.#properties.get(definitionSubstitutionsPropertyName),
    }).applyTo(await this.declared());
  }

  /**
   * The definition as the template wrote it, before substitution.
   */
  private async declared(): Promise<string> {
    const definitionString = this.#properties.get(definitionStringPropertyName);
    const definition = this.#properties.get(definitionPropertyName);
    const s3Location = this.#properties.get(definitionS3LocationPropertyName);

    this.assertOneForm([definitionString, definition, s3Location]);

    if (definitionString !== undefined) {
      return this.readDefinitionString(definitionString);
    }

    if (definition !== undefined) {
      return this.readDefinition(definition);
    }

    if (s3Location !== undefined) {
      return await this.#s3Definition.read(s3Location);
    }

    throw this.definitionError(
      `a state machine needs a ${definitionStringPropertyName}, a ${
        definitionPropertyName
      } or a ${definitionS3LocationPropertyName}`,
    );
  }

  /**
   * Refuse a Resource writing its definition more than one way.
   *
   * The three properties are three ways of saying the same thing, and real
   * CloudFormation takes one of them.
   */
  private assertOneForm(
    declared: readonly (SimCfnTemplateValue | undefined)[],
  ): void {
    if (declared.filter((value) => value !== undefined).length > 1) {
      throw this.definitionError(
        `${definitionStringPropertyName}, ${definitionPropertyName} and ${
          definitionS3LocationPropertyName
        } are three ways of writing the same thing, and a Resource carries one`,
      );
    }
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

  private definitionError(reason: string): Error {
    return simCfnStepFunctionsResourceError(
      stateMachineResourceType,
      this.#logicalId,
      reason,
    );
  }
}
