import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCognitoAttributeConstraintsType } from "../../user-pool/schema/sim-cognito-attribute-constraints.js";
import type { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";

const stringBoundNames = ["MinLength", "MaxLength"];
const numberBoundNames = ["MinValue", "MaxValue"];

interface SimCfnCognitoAttributeConstraintsProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnCognitoPropertyParser;
}

/**
 * Reads the bounds one `Schema` entry of an AWS::Cognito::UserPool Resource
 * puts on its attribute.
 *
 * A bound is a string in the Cognito API and may be written as a number in a
 * template, so both are read and passed on as the string the API wants.
 */
export class SimCfnCognitoAttributeConstraints {
  private readonly resource: SimCfnResource;
  private readonly propertyParser: SimCfnCognitoPropertyParser;

  constructor(properties: SimCfnCognitoAttributeConstraintsProperties) {
    this.resource = properties.resource;
    this.propertyParser = properties.propertyParser;
  }

  /**
   * The bounds the entry declares, of whichever kind it declared.
   */
  parse(
    entry: SimCfnTemplateValueRecord,
    label: string,
  ): SimCognitoAttributeConstraintsType {
    const lengths = this.bounds(
      entry["StringAttributeConstraints"],
      `${label} StringAttributeConstraints`,
      stringBoundNames,
    );
    const range = this.bounds(
      entry["NumberAttributeConstraints"],
      `${label} NumberAttributeConstraints`,
      numberBoundNames,
    );

    return {
      ...(lengths !== undefined && {
        StringAttributeConstraints: {
          MinLength: lengths[0],
          MaxLength: lengths[1],
        },
      }),
      ...(range !== undefined && {
        NumberAttributeConstraints: { MinValue: range[0], MaxValue: range[1] },
      }),
    };
  }

  /**
   * The two bounds of one kind, in the order they were named, or nothing where
   * the entry declares none of that kind. Any key nothing here reads is
   * recorded against the Resource rather than dropped.
   */
  private bounds(
    value: SimCfnTemplateValue | undefined,
    field: string,
    names: readonly string[],
  ): readonly (string | undefined)[] | undefined {
    const declared = this.propertyParser.optionalRecord(
      this.resource,
      value,
      field,
    );

    if (declared === undefined) {
      return undefined;
    }

    this.propertyParser.ignoreUnmodelledKeys(
      this.resource,
      declared,
      names,
      `${field} `,
    );

    const written = new Map(Object.entries(declared));

    return names.map((name) =>
      this.bound(written.get(name), `${field} ${name}`),
    );
  }

  private bound(
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): string | undefined {
    if (typeof value === "number") {
      return String(value);
    }

    return this.propertyParser.optionalString(this.resource, value, label);
  }
}
