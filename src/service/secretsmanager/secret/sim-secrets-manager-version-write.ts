import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimSecretsManagerSecret } from "./sim-secrets-manager-secret.js";
import type { SimSecretsManagerSecretValue } from "./sim-secrets-manager-secret-value.js";

/**
 * The version-shaping fields a write request can carry.
 */
export interface SimSecretsManagerVersionWriteInput {
  readonly ClientRequestToken?: string | undefined;
  readonly VersionStages?: readonly string[] | undefined;
}

/**
 * One write of a secret version, as the three writing commands describe it.
 *
 * CreateSecret, PutSecretValue and UpdateSecret differ in what they do around
 * the write and agree on the write itself, so what they have to say about it
 * is one shape rather than three argument lists.
 */
export interface SimSecretsManagerVersionWrite {
  readonly secret: SimSecretsManagerSecret;
  readonly value: SimSecretsManagerSecretValue;
  readonly input: SimSecretsManagerVersionWriteInput;

  /**
   * The key the new version is encrypted under, in any form KMS accepts.
   * Undefined leaves Secrets Manager to use its own AWS managed key.
   *
   * It is passed rather than read off the secret because UpdateSecret can
   * change the key and the value in one request, and the new version belongs
   * to the new key.
   */
  readonly keyId: string | undefined;

  /**
   * The caller the KMS call is made as, so that writing a version needs the
   * caller's own `kms:GenerateDataKey` on a customer managed key.
   */
  readonly caller: SimAwsCaller | undefined;
}
