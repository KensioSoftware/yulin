import { DynamicFactory } from "@kensio/part-factory";
import type { SimIamPolicy, SimIamPolicyName } from "./sim-iam-policy.js";
import { makeSimPolicyArn, makeSimPolicyId } from "./sim-iam-policy-arn.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";

/**
 * Generates fake IAM managed policy records.
 */
export const simIamPolicyFactory = new DynamicFactory<SimIamPolicy>(() => {
  const now = new Date();
  const policyName = "TestPolicy" as SimIamPolicyName;
  const path = "/";

  return {
    arn: makeSimPolicyArn({
      accountId: makeSimAwsAccountId(),
      path,
      policyName,
    }),
    policyId: makeSimPolicyId(),
    policyName,
    path,
    defaultVersionId: "v1",
    attachmentCount: 0,
    permissionsBoundaryUsageCount: 0,
    isAttachable: true,
    createDate: now,
    updateDate: now,
  };
});
