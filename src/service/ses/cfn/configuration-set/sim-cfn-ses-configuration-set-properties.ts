import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateConfigurationSetCommandInput } from "../../command/configuration-set/configuration-set.command.js";
import { simCfnSesResourceError } from "../sim-cfn-ses-resource-error.js";
import { sesConfigurationSetResourceType } from "../sim-cfn-ses-resource-types.js";
import { readCfnSesConfigurationSetOptions } from "./sim-cfn-ses-configuration-set-option-groups.js";
import {
  actedOnConfigurationSetProperties,
  unsimulatedConfigurationSetPropertyReasons,
} from "./sim-cfn-ses-configuration-set-unsimulated-properties.js";

const maximumNameLength = 64;

interface SimCfnSesConfigurationSetPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::SES::ConfigurationSet properties into the shape
 * CreateConfigurationSet takes.
 *
 * The two APIs agree on every name here, so each option group keeps the name
 * the template gave it. What the reader does is settle the types, which
 * CloudFormation is loose about, and leave the enums to the command. That is
 * what makes a template naming a suppression reason SES has no meaning for
 * fail the deploy rather than sit in the stack.
 */
export class SimCfnSesConfigurationSetProperties {
  readonly #resource: SimCfnResource;
  readonly #properties: ReadonlyMap<string, SimCfnTemplateValue>;
  readonly #ignorer: SimCfnPropertyIgnorer;

  constructor(properties: SimCfnSesConfigurationSetPropertiesProperties) {
    this.#resource = properties.resource;
    this.#ignorer = properties.resource;
    this.#properties = new Map(Object.entries(properties.properties));
  }

  /**
   * What CreateConfigurationSet is called with.
   */
  input(): SimCreateConfigurationSetCommandInput {
    return {
      ConfigurationSetName: this.configurationSetName(),
      ...readCfnSesConfigurationSetOptions(this.#properties, (reason) =>
        this.propertyError(reason),
      ),
    };
  }

  /**
   * Record the properties the set is created without acting on.
   */
  recordIgnoredProperties(): void {
    for (const name of this.#properties.keys()) {
      if (actedOnConfigurationSetProperties.has(name)) {
        continue;
      }

      this.#ignorer.ignoreProperty(
        name,
        unsimulatedConfigurationSetPropertyReasons.get(name) ??
          `${name} is not a property simulated SES reads from ${
            sesConfigurationSetResourceType
          }`,
      );
    }
  }

  /**
   * The set's name.
   *
   * An unnamed set is named after the stack and the logical ID, as real
   * CloudFormation names one.
   */
  private configurationSetName(): string {
    const name = this.#properties.get("Name");

    if (name === undefined) {
      return new SimCfnGeneratedResourceName({
        stackName: this.#resource.stackName,
        logicalId: this.#resource.logicalId,
        maximumLength: maximumNameLength,
      }).value;
    }

    if (typeof name !== "string") {
      throw this.propertyError("Name must be a string");
    }

    return name;
  }

  private propertyError(reason: string): Error {
    return simCfnSesResourceError(
      sesConfigurationSetResourceType,
      this.#resource.logicalId,
      reason,
    );
  }
}
