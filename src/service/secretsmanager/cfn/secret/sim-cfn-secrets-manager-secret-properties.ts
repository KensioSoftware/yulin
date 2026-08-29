import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSecretsManagerTag } from "../../secret/sim-secrets-manager-secret.js";
import { SimCfnSecretsManagerPropertyParser } from "../sim-cfn-secrets-manager-property-parser.js";
import { SimCfnSecretsManagerGenerateSecretStringParser } from "./sim-cfn-secrets-manager-generate-secret-string-parser.js";
import { simCfnSecretsManagerGeneratedName } from "./sim-cfn-secrets-manager-generated-name.js";
import { simCfnSecretsManagerSecretValue } from "./sim-cfn-secrets-manager-secret-value.js";

interface SimCfnSecretsManagerSecretPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::SecretsManager::Secret CloudFormation properties into the shape
 * the secret creator needs.
 *
 * Keeping the property-shape rules here leaves the creator to do nothing but
 * call CreateSecret. Which of the two value properties wins is its own
 * decision, and lives in `simCfnSecretsManagerSecretValue`.
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
   * An unnamed secret is named after the stack and the logical ID, as
   * CloudFormation names one.
   */
  name(): string {
    return (
      this.string(this.properties["Name"], "Name") ??
      simCfnSecretsManagerGeneratedName(this.resource)
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
   */
  secretString(): string {
    return simCfnSecretsManagerSecretValue({
      resource: this.resource,
      supplied: this.string(this.properties["SecretString"], "SecretString"),
      generated: this.generateParser.parse(
        this.resource,
        this.properties["GenerateSecretString"],
      ),
    });
  }

  private string(
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): string | undefined {
    return this.propertyParser.optionalString(this.resource, value, name);
  }
}
