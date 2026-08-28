import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimSecretsManager } from "../../sim-secrets-manager.js";
import { simCfnSecretsManagerJsonKeyValue } from "./sim-cfn-secrets-manager-json-key.js";
import {
  type SimCfnSecretsManagerReference,
  SimCfnSecretsManagerReferenceProblem,
} from "./sim-cfn-secrets-manager-reference-body.js";

/**
 * The secret value one parsed reference names.
 *
 * The version the reference selects, or the current one, read through the
 * ordinary GetSecretValue command as the principal the deployment named. That
 * decrypts the version through simulated KMS, which is why reading a secret
 * has to be waited on.
 */
export async function simCfnSecretsManagerReferenceValue(
  secretsManager: SimSecretsManager,
  reference: SimCfnSecretsManagerReference,
  callerOptions: SimCfnResourceCallerOptions,
): Promise<string> {
  const { secretId, jsonKey, versionStage, versionId } = reference;

  const read = await secretsManager.getSecretValue(
    {
      input: {
        SecretId: secretId,
        VersionStage: versionStage,
        VersionId: versionId,
      },
    },
    callerOptions,
  );

  const secretString = read.SecretString;

  if (secretString === undefined) {
    throw new SimCfnSecretsManagerReferenceProblem(
      `and '${secretId}' holds a binary value, which a dynamic reference ` +
        `cannot read`,
    );
  }

  if (jsonKey === undefined) {
    return secretString;
  }

  return simCfnSecretsManagerJsonKeyValue(secretString, secretId, jsonKey);
}
