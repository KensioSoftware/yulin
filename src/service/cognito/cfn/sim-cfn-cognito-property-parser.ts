import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnCognitoValueParser } from "./sim-cfn-cognito-value-parser.js";

interface SimCfnCognitoPropertyParserProperties {
  readonly resourceType: string;
  readonly simulated: readonly string[];
}

/**
 * Validates the AWS::Cognito::* CloudFormation properties of one Resource
 * type, both which of them may appear and what shape each has to be.
 *
 * Each Resource type states the properties it simulates, and every other
 * property is refused. An allow-list rather than a list of known-unsimulated
 * properties is what keeps a template from quietly deploying something this
 * simulation would ignore, including properties CloudFormation has that the
 * Cognito API does not.
 */
export class SimCfnCognitoPropertyParser extends SimCfnCognitoValueParser {
  private readonly simulated: readonly string[];

  constructor(properties: SimCfnCognitoPropertyParserProperties) {
    super({ resourceType: properties.resourceType });
    this.simulated = properties.simulated;
  }

  /**
   * Refuse every property this Resource type does not simulate.
   *
   * A property whose only simulated value is its AWS default, such as
   * `MfaConfiguration`, counts as simulated here and is refused further down
   * by the Cognito command that receives it.
   */
  requireOnlySimulated(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): void {
    for (const name of Object.keys(properties)) {
      if (!this.simulated.includes(name)) {
        throw this.unsimulatedPropertyError(resource, name);
      }
    }
  }

  /**
   * Parse a property value that must be a list of strings when present.
   */
  optionalStringArray(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): readonly string[] | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw this.invalidPropertyError(resource, label, "a list of strings");
    }

    return value.map((item, index) =>
      this.requiredString(resource, item, `${label}[${String(index)}]`),
    );
  }

  /**
   * Narrow a property value to an object, refusing anything else.
   */
  optionalRecord(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): SimCfnTemplateValueRecord | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw this.invalidPropertyError(resource, label, "an object");
    }

    return value;
  }

  /**
   * Build the diagnostic error for a property this simulator does not model.
   */
  private unsimulatedPropertyError(
    resource: SimCfnResource,
    label: string,
  ): Error {
    return new Error(
      `${this.resourceType} ${resource.logicalId} property ${label} is not ` +
        `simulated, and a deployed Resource ignoring it would behave ` +
        `differently here than on AWS. The simulated properties are ` +
        `${this.simulated.join(", ")}.`,
    );
  }
}
