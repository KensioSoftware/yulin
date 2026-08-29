import { SimSecretsManagerInvalidParameterException } from "../error/sim-secrets-manager.error.js";
import { secretArnSuffixPattern } from "./sim-secrets-manager-secret-arn.js";

/**
 * The longest name Secrets Manager accepts for a secret.
 *
 * https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_CreateSecret.html
 */
export const maximumSimSecretsManagerNameLength = 512;
const allowedCharacters = /^[\w+=./@-]+$/;

/**
 * The name of one simulated secret, validated as real Secrets Manager does.
 *
 * Kept as a value object rather than a bare string because the rules are worth
 * applying in one place: a name that a simulation accepts and real Secrets
 * Manager refuses is exactly the divergence that makes a passing test worthless.
 */
export class SimSecretsManagerSecretName {
  public readonly value: string;

  constructor(name: string | undefined) {
    this.value = SimSecretsManagerSecretName.validated(name);
  }

  private static validated(name: string | undefined): string {
    if (name === undefined || name === "") {
      throw new SimSecretsManagerInvalidParameterException(
        "Name is required to create a secret",
      );
    }

    if (name.length > maximumSimSecretsManagerNameLength) {
      throw new SimSecretsManagerInvalidParameterException(
        `Secret name '${name}' is longer than the ${String(maximumSimSecretsManagerNameLength)} characters Secrets Manager allows`,
      );
    }

    if (!allowedCharacters.test(name)) {
      throw new SimSecretsManagerInvalidParameterException(
        `Secret name '${name}' contains characters Secrets Manager does not allow: ` +
          `only letters, digits and the characters /_+=.@- are permitted`,
      );
    }

    this.refuseAmbiguousSuffix(name);

    return name;
  }

  /**
   * Refuse a name that would be ambiguous with an ARN suffix.
   *
   * Real AWS only advises against this rather than refusing it, so this is a
   * deliberate divergence and a deliberately strict one. A name ending in a
   * hyphen and six characters cannot be told apart from a full ARN's resource
   * part, so a partial ARN naming it could resolve to the wrong secret. A
   * puzzling error at creation is better than a quietly wrong lookup later.
   */
  private static refuseAmbiguousSuffix(name: string): void {
    if (!secretArnSuffixPattern.test(name)) {
      return;
    }

    throw new SimSecretsManagerInvalidParameterException(
      `Secret name '${name}' ends in a hyphen and six characters, which is ` +
        `ambiguous with the suffix Secrets Manager appends to a secret ARN. ` +
        `AWS advises against such names because a partial ARN naming one ` +
        `cannot be resolved reliably; simulated Secrets Manager refuses them.`,
    );
  }
}
