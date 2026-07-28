import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimSecretsManagerGeneratedSecretString } from "../../secret/generate/sim-secrets-manager-generated-secret-string.js";
import { SimSecretsManagerPasswordSpec } from "../../secret/generate/sim-secrets-manager-password-spec.js";
import { SimCfnSecretsManagerPropertyParser } from "../sim-cfn-secrets-manager-property-parser.js";

/**
 * Parses the AWS::SecretsManager::Secret GenerateSecretString property into a
 * generated secret value.
 *
 * CDK synthesises this property for every `secretsmanager.Secret`, even an
 * empty one, so a template that omits every option still has to generate the
 * 32-character password real Secrets Manager would.
 */
export class SimCfnSecretsManagerGenerateSecretStringParser {
  private readonly propertyParser = new SimCfnSecretsManagerPropertyParser();

  /**
   * Parse GenerateSecretString, if the Resource declares it.
   */
  parse(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
  ): SimSecretsManagerGeneratedSecretString | undefined {
    const properties = this.propertyParser.optionalRecord(
      resource,
      value,
      "GenerateSecretString",
    );

    if (properties === undefined) {
      return undefined;
    }

    return new SimSecretsManagerGeneratedSecretString({
      password: this.passwordSpec(resource, properties),
      secretStringTemplate: this.string(
        resource,
        properties["SecretStringTemplate"],
        "SecretStringTemplate",
      ),
      generateStringKey: this.string(
        resource,
        properties["GenerateStringKey"],
        "GenerateStringKey",
      ),
    });
  }

  private passwordSpec(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimSecretsManagerPasswordSpec {
    return new SimSecretsManagerPasswordSpec({
      passwordLength: this.propertyParser.optionalNumber(
        resource,
        properties["PasswordLength"],
        "GenerateSecretString.PasswordLength",
      ),
      excludeCharacters: this.string(
        resource,
        properties["ExcludeCharacters"],
        "ExcludeCharacters",
      ),
      excludeUppercase: this.boolean(
        resource,
        properties["ExcludeUppercase"],
        "ExcludeUppercase",
      ),
      excludeLowercase: this.boolean(
        resource,
        properties["ExcludeLowercase"],
        "ExcludeLowercase",
      ),
      excludeNumbers: this.boolean(
        resource,
        properties["ExcludeNumbers"],
        "ExcludeNumbers",
      ),
      excludePunctuation: this.boolean(
        resource,
        properties["ExcludePunctuation"],
        "ExcludePunctuation",
      ),
      includeSpace: this.boolean(
        resource,
        properties["IncludeSpace"],
        "IncludeSpace",
      ),
      requireEachIncludedType: this.boolean(
        resource,
        properties["RequireEachIncludedType"],
        "RequireEachIncludedType",
      ),
    });
  }

  private string(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): string | undefined {
    return this.propertyParser.optionalString(
      resource,
      value,
      `GenerateSecretString.${name}`,
    );
  }

  private boolean(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): boolean | undefined {
    return this.propertyParser.optionalBoolean(
      resource,
      value,
      `GenerateSecretString.${name}`,
    );
  }
}
