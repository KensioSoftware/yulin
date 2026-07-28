import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSecretsManagerTag } from "../../secret/sim-secrets-manager-secret.js";
import { SimCfnSecretsManagerPropertyParser } from "../sim-cfn-secrets-manager-property-parser.js";
import { SimCfnSecretsManagerGenerateSecretStringParser } from "./sim-cfn-secrets-manager-generate-secret-string-parser.js";

interface SimCfnSecretsManagerSecretPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::SecretsManager::Secret CloudFormation properties into the shape
 * the secret creator needs.
 *
 * Keeping the property-shape rules here leaves the creator to do nothing but
 * call CreateSecret, and puts the one rule worth stating in a single place:
 * a template supplies a value or asks for one to be generated, never both.
 */
export class SimCfnSecretsManagerSecretProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnSecretsManagerPropertyParser();
  private readonly generateParser =
    new SimCfnSecretsManagerGenerateSecretStringParser();

  constructor(properties: SimCfnSecretsManagerSecretPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
  }

  /**
   * The secret name.
   *
   * An unnamed secret is named after its logical ID, as sim CloudFormation
   * names other unnamed resources. Real CloudFormation prefixes the stack
   * name and appends its own random characters, so a template relying on the
   * exact generated name would be relying on something it cannot predict
   * anyway.
   */
  name(): string {
    return (
      this.string(this.properties["Name"], "Name") ?? this.resource.logicalId
    );
  }

  /**
   * The secret Description.
   */
  description(): string | undefined {
    return this.string(this.properties["Description"], "Description");
  }

  /**
   * The KMS key the secret says it is encrypted under.
   */
  kmsKeyId(): string | undefined {
    return this.string(this.properties["KmsKeyId"], "KmsKeyId");
  }

  /**
   * The secret Tags.
   */
  tags(): readonly SimSecretsManagerTag[] | undefined {
    return this.propertyParser.optionalTags(
      this.resource,
      this.properties["Tags"],
      "Tags",
    );
  }

  /**
   * The value the secret's first version holds.
   *
   * Either the template supplies one or it asks for one to be generated.
   */
  secretString(): string {
    const supplied = this.string(
      this.properties["SecretString"],
      "SecretString",
    );
    const generated = this.generateParser.parse(
      this.resource,
      this.properties["GenerateSecretString"],
    );

    if (supplied !== undefined && generated !== undefined) {
      throw this.propertyError(
        "SecretString and GenerateSecretString cannot both be declared: " +
          "a secret either holds the value the template supplies or one " +
          "Secrets Manager generates",
      );
    }

    if (supplied !== undefined) {
      return supplied;
    }

    if (generated !== undefined) {
      return generated.generate();
    }

    throw this.propertyError(
      "either SecretString or GenerateSecretString is required. Real " +
        "CloudFormation creates an empty secret when both are omitted, " +
        "which simulated Secrets Manager does not model, so it refuses the " +
        "Resource rather than creating a secret that has no value to read",
    );
  }

  private string(
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): string | undefined {
    return this.propertyParser.optionalString(this.resource, value, name);
  }

  private propertyError(reason: string): Error {
    return new Error(
      `Invalid AWS::SecretsManager::Secret Resource ` +
        `${this.resource.logicalId}: ${reason}`,
    );
  }
}
