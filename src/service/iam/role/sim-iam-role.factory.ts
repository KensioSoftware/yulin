import { DynamicFactory } from "@kensio/part-factory";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { makeSimRoleArn } from "./sim-iam-role-arn.js";
import { makeSimIamRoleId } from "./sim-iam-role-id.js";
import type { SimIamRole, SimIamRoleName } from "./sim-iam-role.js";

/**
 * Generates fake IAM Role records.
 */
export const simIamRoleFactory = new DynamicFactory<SimIamRole>(() => {
  const accountId = makeSimAwsAccountId();
  const roleName = "ApplicationRole" as SimIamRoleName;
  const path = "/";

  return {
    arn: makeSimRoleArn({
      accountId,
      path,
      roleName,
    }),
    accountId,
    principalType: "role",
    name: roleName,
    roleId: makeSimIamRoleId(),
    roleName,
    path,
    createDate: new Date(),
    inlinePolicies: new Map(),
    attachedPolicyArns: new Set(),
  };
});
