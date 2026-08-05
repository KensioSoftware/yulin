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
 * Reads the AWS::Cognito::* CloudFormation properties of one Resource type,
 * deciding which of them are acted on and checking the shape of those that are.
 *
 * Each Resource type states the properties it simulates, and every other
 * property is recorded against the Resource and left out of what is created.
 * An allow-list rather than a list of known-unsimulated properties is what
 * keeps the record honest: a property CloudFormation has that the Cognito API
 * does not still shows up in it, without this having to name every one.
 *
 * Nothing is deployed quietly. What is not simulated is not silently dropped;
 * it is created without and reported, so a user pool that behaves differently
 * to the template says so.
 */
export class SimCfnCognitoPropertyParser extends SimCfnCognitoValueParser {
  private readonly simulated: readonly string[];

  constructor(properties: SimCfnCognitoPropertyParserProperties) {
    super({ resourceType: properties.resourceType });
    this.simulated = properties.simulated;
  }

  /**
   * Record every property this Resource type does not simulate.
   *
   * A property whose only simulated value is its AWS default, such as
   * `MfaConfiguration`, counts as simulated here and is refused further down
   * by the Cognito command that receives it.
   */
  ignoreUnsimulated(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): void {
    this.ignoreUnmodelledKeys(resource, properties, this.simulated);
  }

  /**
   * Record every key of a nested property object that is not modelled.
   *
   * A nested object is held to the same rule as the properties around it. A
   * `Policies` or a `TokenValidityUnits` carrying a key nothing here reads
   * would otherwise be dropped on the way to the Command without a word about
   * it, which is the quiet ignoring the top-level allow-list exists to prevent.
   */
  ignoreUnmodelledKeys(
    resource: SimCfnResource,
    record: SimCfnTemplateValueRecord,
    modelled: readonly string[],
    path = "",
  ): void {
    for (const name of Object.keys(record)) {
      if (!modelled.includes(name)) {
        resource.ignoreProperty(
          `${path}${name}`,
          this.unsimulatedPropertyReason(`${path}${name}`, modelled),
        );
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
   * Say why a property this simulator does not model was left out.
   *
   * The modelled names are listed because a Cognito Resource type has a lot of
   * properties and few of them are simulated, so what this can act on is
   * shorter and more useful to read than what it cannot.
   */
  private unsimulatedPropertyReason(
    label: string,
    modelled: readonly string[],
  ): string {
    return (
      `${this.resourceType} property ${label} is not simulated, so the ` +
      `Resource is created without it and behaves differently here than on ` +
      `AWS. The simulated properties are ${modelled.join(", ")}.`
    );
  }
}
