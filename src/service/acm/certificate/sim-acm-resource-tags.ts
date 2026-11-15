import type { SimArn } from "../../aws/arn.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import {
  SimIamResourceTagAuthZ,
  simIamTagRecord,
} from "../../iam/tag/sim-iam-resource-tag-auth-z.js";
import type { SimAcmCertificate } from "./sim-acm-certificate.js";

/**
 * IAM authorization that gives a policy the tags of the certificate a request
 * acts on, as `aws:ResourceTag/<key>`.
 */
export function simAcmTagConditionIam(
  iam: SimIamInterServiceAuthZ,
  certificates: ReadonlyMap<SimArn, SimAcmCertificate>,
): SimIamInterServiceAuthZ {
  return new SimIamResourceTagAuthZ(iam, (resource) =>
    simIamTagRecord(certificates.get(resource as SimArn)?.tags),
  );
}
