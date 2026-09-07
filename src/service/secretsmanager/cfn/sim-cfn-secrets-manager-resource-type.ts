/** The one AWS::SecretsManager::* Resource type this simulation deploys. */
const secretResourceTypeName = "Secret";

/**
 * Whether a Resource type name is the secret this simulation deploys.
 */
export function isSimCfnSecretsManagerSecret(
  resourceTypeName: string,
): boolean {
  return resourceTypeName === secretResourceTypeName;
}

/**
 * Refuse an operation on a Resource type this simulation does not deploy.
 *
 * The refusal reads as an unsupported Resource, so the Stack records it and
 * carries on rather than failing. Creation names no operation, since a
 * Resource type nothing creates is the plain case a reader meets first.
 */
export function requireSimCfnSecretsManagerSecret(
  resourceTypeName: string,
  operation?: string,
): void {
  if (isSimCfnSecretsManagerSecret(resourceTypeName)) {
    return;
  }

  const refused = operation === undefined ? "" : ` ${operation}`;

  throw new Error(
    `Unsupported sim Secrets Manager CloudFormation Resource ${resourceTypeName}${refused}`,
  );
}
