import { SimCfnSecretsManagerReferenceProblem } from "./sim-cfn-secrets-manager-reference-body.js";

/**
 * One key of a secret holding a JSON object.
 *
 * Real CloudFormation refuses a key the secret has no value for. A template
 * naming a key that has since been renamed fails, where substituting nothing
 * would have deployed an empty password.
 */
export function simCfnSecretsManagerJsonKeyValue(
  secretString: string,
  secretId: string,
  jsonKey: string,
): string {
  const parsed = jsonObject(secretString);

  if (parsed === undefined) {
    throw new SimCfnSecretsManagerReferenceProblem(
      `and '${secretId}' does not hold a JSON object, so it has no ` +
        `'${jsonKey}' key`,
    );
  }

  const value = parsed.get(jsonKey);

  if (value === undefined) {
    throw new SimCfnSecretsManagerReferenceProblem(
      `and '${secretId}' holds no '${jsonKey}' key`,
    );
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * The secret value read as a JSON object, or nothing where it is not one.
 *
 * The keys come back as a map so that a secret naming one of them `__proto__`
 * reads that key of the secret.
 */
function jsonObject(secretString: string): Map<string, unknown> | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(secretString);
  } catch {
    return undefined;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }

  return new Map(Object.entries(parsed));
}
