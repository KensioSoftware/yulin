import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

export interface SimCfnIamRoleInlinePolicy {
  readonly policyName: string;
  readonly policyDocument: string;
}

/**
 * Parses the AWS::IAM::Role policy collection properties: the inline `Policies`
 * list and the attached `ManagedPolicyArns` list.
 *
 * These list-shaped properties carry the bulk of the Role property validation,
 * so grouping them here keeps the main Role props parser small.
 */
export class SimCfnIamRolePoliciesParser {
  /**
   * Parse the inline `Policies` property into normalised inline policies.
   */
  inlinePolicies(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): readonly SimCfnIamRoleInlinePolicy[] {
    const policies = properties["Policies"];

    if (policies === undefined) {
      return [];
    }

    if (!Array.isArray(policies)) {
      throw new TypeError(
        `Invalid AWS::IAM::Role ${resource.logicalId}: Policies must be an array`,
      );
    }

    return policies.map((policy) => this.inlinePolicy(resource, policy));
  }

  /**
   * Parse the attached `ManagedPolicyArns` property into policy ARN strings.
   */
  managedPolicyArns(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): readonly string[] {
    const managedPolicyArns = properties["ManagedPolicyArns"];

    if (managedPolicyArns === undefined) {
      return [];
    }

    if (!Array.isArray(managedPolicyArns)) {
      throw new TypeError(
        `Invalid AWS::IAM::Role ${resource.logicalId}: ManagedPolicyArns must be an array`,
      );
    }

    return managedPolicyArns.map((arn) => {
      if (typeof arn !== "string") {
        throw new TypeError(
          `Invalid AWS::IAM::Role ${resource.logicalId}: each ManagedPolicyArns entry must be a string`,
        );
      }

      return arn;
    });
  }

  private inlinePolicy(
    resource: SimCfnResource,
    policy: SimCfnTemplateValueRecord[string] | undefined,
  ): SimCfnIamRoleInlinePolicy {
    if (
      typeof policy !== "object" ||
      policy === null ||
      Array.isArray(policy)
    ) {
      throw new TypeError(
        `Invalid AWS::IAM::Role ${resource.logicalId}: each Policies entry must be an object`,
      );
    }

    const policyName = policy["PolicyName"];

    if (typeof policyName !== "string") {
      throw new TypeError(
        `Invalid AWS::IAM::Role ${resource.logicalId}: Policies entry PolicyName must be a string`,
      );
    }

    const policyDocument = policy["PolicyDocument"];

    if (
      typeof policyDocument !== "object" ||
      policyDocument === null ||
      Array.isArray(policyDocument)
    ) {
      throw new TypeError(
        `Invalid AWS::IAM::Role ${resource.logicalId}: Policies entry PolicyDocument must be an object`,
      );
    }

    return {
      policyName,
      policyDocument: JSON.stringify(policyDocument),
    };
  }
}
