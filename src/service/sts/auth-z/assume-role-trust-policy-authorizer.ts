import type { JSONString } from "../../../util/type-guard/json.js";
import { jsonParse } from "../../../util/type-guard/json.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import type { SimGetRoleCommandOutput } from "../../iam/command/role/get-role/get-role.cmd.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import type {
  SimIamConditionValue,
  SimIamPolicyDocument,
} from "../../iam/policy/sim-iam-policy.js";
import type { SimIam } from "../../iam/sim-iam.js";

type AssumeRoleTargetRole = SimGetRoleCommandOutput["Role"];

interface AssumeRoleTrustPolicyAuthorizationInput {
  readonly roleArn: string;
  readonly role: AssumeRoleTargetRole;
  readonly targetIam: SimIam;
  readonly caller: SimAwsPrincipal;
  readonly conditionContext?:
    Readonly<Record<string, SimIamConditionValue>> | undefined;
}

/**
 * Evaluates an AssumeRole request against a target Role's trust policy.
 *
 * Trust policies are resource policies attached to IAM Roles. An AssumeRole
 * request succeeds only when the policy evaluation produces a trust-policy Allow
 * and does not produce an explicit Deny.
 *
 * Keeping this evaluation separate from target resolution and Role loading makes
 * the authorization boundary easier to maintain. This class receives an already
 * loaded Role and the IAM facade for its account, then owns all processing of the
 * Role's AssumeRolePolicyDocument.
 */
export class AssumeRoleTrustPolicyAuthorizer {
  /**
   * Require the target Role's trust policy to allow the supplied caller.
   *
   * IAM stores AssumeRolePolicyDocument as JSON text. The document is parsed here,
   * after checking that it exists, because policy evaluation requires a structured
   * policy document.
   *
   * An explicit Deny always rejects the request. The request is also rejected when
   * no trust-policy statement grants access, even if no explicit Deny matched.
   */
  authorize(input: AssumeRoleTrustPolicyAuthorizationInput): void {
    assertDefined(
      input.role.AssumeRolePolicyDocument,
      `Access denied for sts:AssumeRole on ${input.roleArn}: target Role has no trust policy`,
    );

    const trustPolicy = jsonParse(
      input.role.AssumeRolePolicyDocument as JSONString<SimIamPolicyDocument>,
    );

    const decision = input.targetIam.authorize({
      action: "sts:AssumeRole",
      resource: input.roleArn,
      caller: input.caller,
      conditionContext: input.conditionContext,
      resourcePolicies: [
        {
          sourceType: "trust",
          policyName: "AssumeRolePolicyDocument",
          resourceArn: input.roleArn,
          document: trustPolicy,
        },
      ],
    });

    if (decision.isDenied || !decision.isAllowedByTrustPolicy) {
      throw new SimIamAccessDenied({
        caller: input.caller,
        action: "sts:AssumeRole",
        resource: input.roleArn,
      });
    }
  }
}
