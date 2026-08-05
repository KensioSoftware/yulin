import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnKmsPropertyParser } from "../sim-cfn-kms-property-parser.js";
import { SimCfnKmsUnsimulatedKeyProperties } from "./sim-cfn-kms-unsimulated-key-properties.js";

interface SimCfnKmsKeyPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::KMS::Key CloudFormation properties into the shape the key creator
 * needs.
 *
 * Keeping the property-shape rules here leaves the creator to do nothing but
 * call CreateKey, and puts the refusals for unmodelled key behaviour in one
 * place beside the properties they belong to.
 *
 * Those refusals run on construction rather than when a property is read, so
 * a Resource asking for something unmodelled cannot get as far as creating a
 * key that would then be wrong.
 */
export class SimCfnKmsKeyProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnKmsPropertyParser({
    resourceType: "AWS::KMS::Key",
  });

  constructor(properties: SimCfnKmsKeyPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    new SimCfnKmsUnsimulatedKeyProperties({
      propertyParser: this.propertyParser,
    }).apply(this.resource, this.properties);
  }

  /**
   * The key Description.
   */
  description(): string | undefined {
    return this.string(this.properties["Description"], "Description");
  }

  /**
   * The key policy, as the JSON document string CreateKey takes.
   *
   * Omitting it gets the default root-delegation policy KMS applies, which is
   * the same thing CreateKey does with no Policy.
   */
  policy(): string | undefined {
    return this.propertyParser.optionalPolicyJson(
      this.resource,
      this.properties["KeyPolicy"],
      "KeyPolicy",
    );
  }

  /**
   * The requested key spec, passed through so CreateKey refuses the specs this
   * simulation does not create.
   */
  keySpec(): string | undefined {
    return this.string(this.properties["KeySpec"], "KeySpec");
  }

  /**
   * The requested key usage, passed through to CreateKey in the same way.
   */
  keyUsage(): string | undefined {
    return this.string(this.properties["KeyUsage"], "KeyUsage");
  }

  /**
   * The requested key material origin, passed through to CreateKey in the same
   * way.
   */
  origin(): string | undefined {
    return this.string(this.properties["Origin"], "Origin");
  }

  /**
   * Whether the deployed key is enabled. A key is enabled unless the template
   * says otherwise, as on real CloudFormation.
   */
  enabled(): boolean {
    return (
      this.propertyParser.optionalBoolean(
        this.resource,
        this.properties["Enabled"],
        "Enabled",
      ) ?? true
    );
  }

  private string(
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): string | undefined {
    return this.propertyParser.optionalString(this.resource, value, name);
  }
}
