import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSsmTag } from "../../command/parameter/parameter.command.js";

interface SimCfnSsmParameterPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::SSM::Parameter CloudFormation properties into the shape
 * PutParameter takes.
 *
 * Everything this reads is handed to PutParameter rather than applied here,
 * so the options Parameter Store refuses are refused in one place. The one
 * rule that belongs here is the type: real CloudFormation refuses
 * `SecureString` for this Resource type whatever Parameter Store itself
 * supports, so the refusal is a property of the Resource rather than of the
 * simulation.
 */
export class SimCfnSsmParameterProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(properties: SimCfnSsmParameterPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
  }

  /**
   * The parameter name.
   *
   * An unnamed parameter is named after its logical ID, as sim CloudFormation
   * names other unnamed resources. Real CloudFormation generates a name from
   * the stack name and its own random characters, which a template could not
   * predict anyway.
   */
  name(): string {
    return (
      this.string(this.properties["Name"], "Name") ?? this.resource.logicalId
    );
  }

  /**
   * The parameter type.
   *
   * Required, as it is on real CloudFormation, and never `SecureString`.
   */
  type(): string {
    const type = this.string(this.properties["Type"], "Type");

    if (type === undefined) {
      throw this.propertyError("Type is required");
    }

    if (type === "SecureString") {
      throw this.propertyError(
        "Type SecureString is not supported. Real CloudFormation refuses to " +
          "create a SecureString parameter from a template, because the " +
          "plaintext value would sit in the template, so a stack has to " +
          "reference a parameter created another way",
      );
    }

    return type;
  }

  /**
   * The value the parameter's first version holds.
   */
  value(): string {
    const value = this.string(this.properties["Value"], "Value");

    if (value === undefined) {
      throw this.propertyError("Value is required");
    }

    return value;
  }

  /**
   * The parameter Description.
   */
  description(): string | undefined {
    return this.string(this.properties["Description"], "Description");
  }

  /**
   * The parameter Tier.
   *
   * Handed to PutParameter, which refuses any tier but Standard.
   */
  tier(): string | undefined {
    return this.string(this.properties["Tier"], "Tier");
  }

  /**
   * The parameter AllowedPattern, which PutParameter refuses.
   */
  allowedPattern(): string | undefined {
    return this.string(this.properties["AllowedPattern"], "AllowedPattern");
  }

  /**
   * The parameter DataType, which PutParameter refuses beyond plain text.
   */
  dataType(): string | undefined {
    return this.string(this.properties["DataType"], "DataType");
  }

  /**
   * The parameter Policies, which PutParameter refuses.
   */
  policies(): string | undefined {
    return this.string(this.properties["Policies"], "Policies");
  }

  /**
   * The parameter Tags, which PutParameter refuses.
   *
   * CloudFormation carries these as a map of names to values for this
   * Resource type, rather than the list of Key/Value pairs most Resource
   * types use, so they are turned into the list shape PutParameter takes.
   */
  tags(): readonly SimSsmTag[] | undefined {
    const tags = this.properties["Tags"];

    if (tags === undefined) {
      return undefined;
    }

    if (typeof tags !== "object" || tags === null || Array.isArray(tags)) {
      throw this.propertyError("Tags must be an object");
    }

    return Object.entries(tags).map(([key, value]) => {
      return { Key: key, Value: this.stringValue(value, `Tags.${key}`) };
    });
  }

  private string(
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    return this.stringValue(value, name);
  }

  private stringValue(
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): string {
    if (typeof value !== "string") {
      throw this.propertyError(`${name} must be a string`);
    }

    return value;
  }

  private propertyError(reason: string): Error {
    return new Error(
      `Invalid AWS::SSM::Parameter Resource ${this.resource.logicalId}: ${reason}`,
    );
  }
}
