import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import {
  SimIamResourceTagAuthZ,
  simIamTagRecord,
} from "../../iam/tag/sim-iam-resource-tag-auth-z.js";
import type { SimSesIdentityStore } from "./sim-ses-identity-store.js";

/**
 * IAM authorization that gives a policy the tags of the email identity a
 * request acts on, as `aws:ResourceTag/<key>`.
 */
export function simSesTagConditionIam(
  iam: SimIamInterServiceAuthZ,
  identities: SimSesIdentityStore,
): SimIamInterServiceAuthZ {
  return new SimIamResourceTagAuthZ(iam, (resource) => {
    const name = /:identity\/(.+)$/v.exec(resource)?.[1];
    const identity = name === undefined ? undefined : identities.find(name);

    return identity?.arn === resource
      ? simIamTagRecord(identity.settings.tags)
      : undefined;
  });
}
