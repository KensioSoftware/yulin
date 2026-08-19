import type { SimIamManagedPolicy } from "../../../../iam/policy/sim-iam-policy.js";
import type { SimIamRole } from "../../../../iam/role/sim-iam-role.js";
import type { SimIamUser } from "../../../../iam/user/sim-iam-user.js";
import { SimIamManagedPolicyCfn } from "./sim-iam-managed-policy-cfn.js";
import { SimIamRoleCfn } from "./sim-iam-role-cfn.js";
import { SimIamUserCfn } from "./sim-iam-user-cfn.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";

/**
 * The CloudFormation-facing value adapter for a simulated IAM Resource.
 */
export function iamValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (properties.type === "AWS::IAM::ManagedPolicy") {
    return new SimIamManagedPolicyCfn({
      policy: properties.simResource as SimIamManagedPolicy,
    });
  }

  if (properties.type === "AWS::IAM::Role") {
    return new SimIamRoleCfn({ role: properties.simResource as SimIamRole });
  }

  if (properties.type === "AWS::IAM::User") {
    return new SimIamUserCfn({ user: properties.simResource as SimIamUser });
  }

  return undefined;
}
