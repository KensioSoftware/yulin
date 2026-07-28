import { SimSecretsManagerInvalidParameterException } from "../../error/sim-secrets-manager.error.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import { SimSecretsManagerPasswordGenerator } from "./sim-secrets-manager-password-generator.js";
import type { SimSecretsManagerPasswordSpec } from "./sim-secrets-manager-password-spec.js";

interface SimSecretsManagerGeneratedSecretStringProperties {
  readonly password: SimSecretsManagerPasswordSpec;
  readonly secretStringTemplate?: string | undefined;
  readonly generateStringKey?: string | undefined;
}

/**
 * A secret value Secrets Manager generates rather than one a caller supplies.
 *
 * With a template and a key, the generated password is added to the template's
 * JSON object under that key, which is how a secret ends up holding a username
 * a template chose alongside a password nobody has ever seen. With neither,
 * the whole secret value is the generated password.
 */
export class SimSecretsManagerGeneratedSecretString {
  private readonly password: SimSecretsManagerPasswordSpec;
  private readonly secretStringTemplate: string | undefined;
  private readonly generateStringKey: string | undefined;
  private readonly generator = new SimSecretsManagerPasswordGenerator();

  constructor(properties: SimSecretsManagerGeneratedSecretStringProperties) {
    this.password = properties.password;
    this.secretStringTemplate = properties.secretStringTemplate;
    this.generateStringKey = properties.generateStringKey;

    this.requireTemplateAndKeyTogether();
  }

  /**
   * Generate the value the secret's first version will hold.
   */
  generate(): string {
    const password = this.generator.generate(this.password);
    const { secretStringTemplate: template, generateStringKey: key } = this;

    if (template === undefined || key === undefined) {
      return password;
    }

    return JSON.stringify({
      ...this.templateObject(template),
      [key]: password,
    });
  }

  /**
   * Refuse a template without a key, or a key without a template.
   *
   * Real Secrets Manager requires each one when the other is given: a template
   * with nowhere to put the password would silently produce a secret with no
   * generated value in it at all.
   */
  private requireTemplateAndKeyTogether(): void {
    const hasTemplate = this.secretStringTemplate !== undefined;
    const hasKey = this.generateStringKey !== undefined;

    if (hasTemplate === hasKey) {
      return;
    }

    throw new SimSecretsManagerInvalidParameterException(
      "SecretStringTemplate and GenerateStringKey have to be supplied " +
        "together: a template needs a key naming where the generated value " +
        "goes, and a key needs a template to put it in",
    );
  }

  private templateObject(template: string): Record<string, unknown> {
    const parsed = this.parsedTemplate(template);

    if (!isRecord(parsed)) {
      throw new SimSecretsManagerInvalidParameterException(
        `SecretStringTemplate must be a JSON object: ${template}`,
      );
    }

    return parsed;
  }

  private parsedTemplate(template: string): unknown {
    try {
      return JSON.parse(template);
    } catch {
      throw new SimSecretsManagerInvalidParameterException(
        `SecretStringTemplate is not valid JSON: ${template}`,
      );
    }
  }
}
