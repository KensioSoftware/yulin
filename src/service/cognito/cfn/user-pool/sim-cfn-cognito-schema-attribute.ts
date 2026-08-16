import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCognitoSchemaAttributeType } from "../../user-pool/schema/sim-cognito-schema-attribute.js";
import type { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";
import { SimCfnCognitoAttributeConstraints } from "./sim-cfn-cognito-attribute-constraints.js";

/**
 * The `Schema` entry fields this simulation reads, which are all of them.
 */
const modelledFields = [
  "Name",
  "AttributeDataType",
  "DeveloperOnlyAttribute",
  "Mutable",
  "Required",
  "StringAttributeConstraints",
  "NumberAttributeConstraints",
];

interface SimCfnCognitoSchemaAttributeProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnCognitoPropertyParser;
}

/**
 * Reads one entry of an AWS::Cognito::UserPool `Schema` into the attribute
 * declaration CreateUserPool takes.
 *
 * The declaration is passed on rather than judged here. CreateUserPool holds
 * it to what real Cognito accepts, so a template asking for an attribute AWS
 * would refuse fails the stack with the same words an SDK caller would have
 * been given.
 */
export class SimCfnCognitoSchemaAttribute {
  private readonly resource: SimCfnResource;
  private readonly propertyParser: SimCfnCognitoPropertyParser;
  private readonly constraints: SimCfnCognitoAttributeConstraints;

  constructor(properties: SimCfnCognitoSchemaAttributeProperties) {
    this.resource = properties.resource;
    this.propertyParser = properties.propertyParser;
    this.constraints = new SimCfnCognitoAttributeConstraints(properties);
  }

  /**
   * The attribute the entry at that position in the list declares.
   */
  parse(
    value: SimCfnTemplateValue,
    index: number,
  ): SimCognitoSchemaAttributeType {
    const label = `Schema[${String(index)}]`;
    const entry = this.propertyParser.optionalRecord(
      this.resource,
      value,
      label,
    );

    // A list entry is always something, so the parser above has either
    // answered with the object or refused whatever else the template wrote.
    assertDefined(entry, `${this.resource.logicalId} ${label}`);

    this.propertyParser.ignoreUnmodelledKeys(
      this.resource,
      entry,
      modelledFields,
      `${label} `,
    );

    return {
      Name: this.string(entry["Name"], `${label} Name`),
      AttributeDataType: this.string(
        entry["AttributeDataType"],
        `${label} AttributeDataType`,
      ),
      DeveloperOnlyAttribute: this.boolean(
        entry["DeveloperOnlyAttribute"],
        `${label} DeveloperOnlyAttribute`,
      ),
      Mutable: this.boolean(entry["Mutable"], `${label} Mutable`),
      Required: this.boolean(entry["Required"], `${label} Required`),
      ...this.constraints.parse(entry, label),
    };
  }

  private string(
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): string | undefined {
    return this.propertyParser.optionalString(this.resource, value, label);
  }

  private boolean(
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): boolean | undefined {
    return this.propertyParser.optionalBoolean(this.resource, value, label);
  }
}
