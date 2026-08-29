import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimSecretsManagerGeneratedSecretString } from "../../secret/generate/sim-secrets-manager-generated-secret-string.js";

interface SimCfnSecretsManagerSecretValueProperties {
  readonly resource: SimCfnResource;
  readonly supplied: string | undefined;
  readonly generated: SimSecretsManagerGeneratedSecretString | undefined;
}

/**
 * The value a secret's first version holds.
 *
 * A template supplies a value or asks for one to be generated, never both and
 * never neither. Real CloudFormation creates an empty secret where both are
 * omitted, which simulated Secrets Manager has no model for, and a secret with
 * no value to read is worse to be handed than a refusal.
 */
export function simCfnSecretsManagerSecretValue(
  properties: SimCfnSecretsManagerSecretValueProperties,
): string {
  const { resource, supplied, generated } = properties;

  if (supplied !== undefined && generated !== undefined) {
    throw refusal(
      resource,
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

  throw refusal(
    resource,
    "either SecretString or GenerateSecretString is required. Real " +
      "CloudFormation creates an empty secret when both are omitted, " +
      "which simulated Secrets Manager does not model, so it refuses the " +
      "Resource rather than creating a secret that has no value to read",
  );
}

function refusal(resource: SimCfnResource, reason: string): Error {
  return new Error(
    `Invalid AWS::SecretsManager::Secret Resource ` +
      `${resource.logicalId}: ${reason}`,
  );
}
