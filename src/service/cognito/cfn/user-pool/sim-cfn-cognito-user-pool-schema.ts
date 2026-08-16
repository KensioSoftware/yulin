import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCognitoSchemaAttributeType } from "../../user-pool/schema/sim-cognito-schema-attribute.js";
import type { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";
import { SimCfnCognitoSchemaAttribute } from "./sim-cfn-cognito-schema-attribute.js";

interface SimCfnCognitoUserPoolSchemaProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnCognitoPropertyParser;
}

/**
 * Reads the `Schema` property of an AWS::Cognito::UserPool Resource into the
 * attribute declarations CreateUserPool takes.
 *
 * This is what a CDK `UserPool` emits for its `customAttributes`, and for a
 * `standardAttributes` entry saying an attribute is required.
 */
export class SimCfnCognitoUserPoolSchema {
  private readonly resource: SimCfnResource;
  private readonly propertyParser: SimCfnCognitoPropertyParser;
  private readonly attribute: SimCfnCognitoSchemaAttribute;

  constructor(properties: SimCfnCognitoUserPoolSchemaProperties) {
    this.resource = properties.resource;
    this.propertyParser = properties.propertyParser;
    this.attribute = new SimCfnCognitoSchemaAttribute(properties);
  }

  /**
   * The attributes the template declares, or undefined where it declares none.
   */
  parse(
    value: SimCfnTemplateValue | undefined,
  ): readonly SimCognitoSchemaAttributeType[] | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw this.propertyParser.invalidPropertyError(
        this.resource,
        "Schema",
        "a list of attribute declarations",
      );
    }

    return value.map((entry, index) => this.attribute.parse(entry, index));
  }
}
