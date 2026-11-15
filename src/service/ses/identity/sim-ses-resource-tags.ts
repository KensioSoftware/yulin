import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import {
  SimIamResourceTagAuthZ,
  simIamTagRecord,
} from "../../iam/tag/sim-iam-resource-tag-auth-z.js";
import type { SimSesIdentityStore } from "./sim-ses-identity-store.js";

/**
 * IAM authorization that gives a policy the tags of the email identity a
 * request acts on, as `aws:ResourceTag/<key>`.
 *
 * A domain is found whatever case a request writes it in, and the ARN the
 * request names keeps that case. The two ARNs compare without regard to it.
 */
export function simSesTagConditionIam(
  iam: SimIamInterServiceAuthZ,
  identities: SimSesIdentityStore,
): SimIamInterServiceAuthZ {
  return new SimIamResourceTagAuthZ(iam, (resource) => {
    const name = /:identity\/(.+)$/v.exec(resource)?.[1];
    const identity = name === undefined ? undefined : identities.find(name);

    return identity?.arn.toLowerCase() === resource.toLowerCase()
      ? simIamTagRecord(identity.settings.tags)
      : undefined;
  });
}
