import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import {
  SimIamResourceTagAuthZ,
  simIamTagRecord,
} from "../../iam/tag/sim-iam-resource-tag-auth-z.js";
import type { SimSecretsManagerSecretStore } from "./sim-secrets-manager-secret-store.js";

/**
 * IAM authorization that gives a policy the tags of the secret a request acts
 * on, as both `aws:ResourceTag/<key>` and `secretsmanager:ResourceTag/<key>`.
 */
export function simSecretsManagerTagConditionIam(
  iam: SimIamInterServiceAuthZ,
  secrets: SimSecretsManagerSecretStore,
): SimIamInterServiceAuthZ {
  return new SimIamResourceTagAuthZ(
    iam,
    (resource) => simIamTagRecord(secrets.findByArn(resource)?.tags),
    "secretsmanager",
  );
}
