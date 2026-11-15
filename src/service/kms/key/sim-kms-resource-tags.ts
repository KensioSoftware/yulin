import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamResourceTagAuthZ } from "../../iam/tag/sim-iam-resource-tag-auth-z.js";
import type { SimKmsKeyStore } from "./sim-kms-key-store.js";

/**
 * IAM authorization that gives a policy the tags of the key a request acts
 * on, as `aws:ResourceTag/<key>`.
 *
 * Real KMS supports the key in IAM policies only, and leaves it out of a key
 * policy's evaluation. Both are evaluated against the same values here, so a
 * key policy conditioned on a tag matches where on AWS it would not.
 */
export function simKmsTagConditionIam(
  iam: SimIamInterServiceAuthZ,
  keys: SimKmsKeyStore,
): SimIamInterServiceAuthZ {
  return new SimIamResourceTagAuthZ(iam, (resource) => {
    const keyId = /:key\/([^\/]+)$/v.exec(resource)?.[1];
    const key = keyId === undefined ? undefined : keys.keys.get(keyId);

    return key?.arn === resource ? key.tags.record() : undefined;
  });
}
