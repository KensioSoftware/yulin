import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnKmsPropertyParser } from "../sim-cfn-kms-property-parser.js";

interface SimCfnKmsAliasPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::KMS::Alias CloudFormation properties into the shape the alias
 * creator needs.
 *
 * Both properties are required, as they are on real CloudFormation: an alias
 * with no name names nothing, and an alias with no target points at nothing.
 */
export class SimCfnKmsAliasProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnKmsPropertyParser({
    resourceType: "AWS::KMS::Alias",
  });

  constructor(properties: SimCfnKmsAliasPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
  }

  /**
   * The alias name, including its `alias/` prefix.
   */
  aliasName(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["AliasName"],
      "AliasName",
    );
  }

  /**
   * The key the alias points at, in any of the forms KMS accepts as a KeyId.
   *
   * A template usually gets here through `!Ref` on its AWS::KMS::Key, which
   * resolves to that key's key ID.
   */
  targetKeyId(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["TargetKeyId"],
      "TargetKeyId",
    );
  }
}
