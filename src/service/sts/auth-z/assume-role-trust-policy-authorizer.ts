import type { JSONString } from "../../../util/type-guard/json.js";
import { jsonParse } from "../../../util/type-guard/json.js";
import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import type { SimGetRoleCommandOutput } from "../../iam/command/role/get-role/get-role.command.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import type {
  SimIamConditionValue,
  SimIamPolicyDocument,
} from "../../iam/policy/sim-iam-policy.js";
import type { SimIam } from "../../iam/sim-iam.js";
import type { SimIamPolicyDecision } from "../../iam/authorize/sim-iam-decision.js";
import { AssumeRoleTrustGrantClassifier } from "./assume-role-trust-grant-classifier.js";

type AssumeRoleTargetRole = SimGetRoleCommandOutput["Role"];

interface AssumeRoleTrustPolicyAuthorizationInput {
  readonly roleArn: string;
  readonly role: AssumeRoleTargetRole;
  readonly targetIam: SimIam;
  readonly caller: SimAwsPrincipal;
  readonly conditionContext?:
    | Readonly<Record<string, SimIamConditionValue>>
    | undefined;
}

export interface AssumeRoleTrustPolicyAuthorization {
  readonly decision: SimIamPolicyDecision;
  readonly isDirectPrincipalGrant: boolean;
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
  private readonly trustGrantClassifier = new AssumeRoleTrustGrantClassifier();

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
  authorize(
    input: AssumeRoleTrustPolicyAuthorizationInput,
  ): AssumeRoleTrustPolicyAuthorization {
    if (input.role.AssumeRolePolicyDocument === undefined) {
      throw new SimIamAccessDenied({
        principal: input.caller,
        action: "sts:AssumeRole",
        resource: input.roleArn,
      });
    }

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
        principal: input.caller,
        action: "sts:AssumeRole",
        resource: input.roleArn,
      });
    }

    return {
      decision,
      isDirectPrincipalGrant: this.trustGrantClassifier.hasDirectPrincipalGrant(
        decision.trustAllowStatements,
      ),
    };
  }
}
