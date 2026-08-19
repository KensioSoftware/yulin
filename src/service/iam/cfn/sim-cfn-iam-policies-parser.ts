import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

export interface SimCfnIamInlinePolicy {
  readonly policyName: string;
  readonly policyDocument: string;
}

interface SimCfnIamPoliciesParserProperties {
  /**
   * The Resource type being parsed, for error messages.
   */
  readonly resourceType: string;
}

/**
 * Parses the policy collection properties an IAM identity Resource carries:
 * the inline `Policies` list and the attached `ManagedPolicyArns` list.
 *
 * AWS::IAM::Role and AWS::IAM::User declare both in the same shape, and these
 * list-shaped properties carry the bulk of the property validation, so
 * grouping them here keeps each identity's own props parser small.
 */
export class SimCfnIamPoliciesParser {
  private readonly resourceType: string;

  constructor(properties: SimCfnIamPoliciesParserProperties) {
    this.resourceType = properties.resourceType;
  }

  /**
   * Parse the inline `Policies` property into normalised inline policies.
   */
  inlinePolicies(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): readonly SimCfnIamInlinePolicy[] {
    const policies = properties["Policies"];

    if (policies === undefined) {
      return [];
    }

    if (!Array.isArray(policies)) {
      throw new TypeError(
        `Invalid ${this.resourceType} ${resource.logicalId}: Policies must be an array`,
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
        `Invalid ${this.resourceType} ${resource.logicalId}: ManagedPolicyArns must be an array`,
      );
    }

    return managedPolicyArns.map((arn) => {
      if (typeof arn !== "string") {
        throw new TypeError(
          `Invalid ${this.resourceType} ${resource.logicalId}: each ManagedPolicyArns entry must be a string`,
        );
      }

      return arn;
    });
  }

  private inlinePolicy(
    resource: SimCfnResource,
    policy: SimCfnTemplateValueRecord[string] | undefined,
  ): SimCfnIamInlinePolicy {
    if (
      typeof policy !== "object" ||
      policy === null ||
      Array.isArray(policy)
    ) {
      throw new TypeError(
        `Invalid ${this.resourceType} ${resource.logicalId}: each Policies entry must be an object`,
      );
    }

    const policyName = policy["PolicyName"];

    if (typeof policyName !== "string") {
      throw new TypeError(
        `Invalid ${this.resourceType} ${resource.logicalId}: Policies entry PolicyName must be a string`,
      );
    }

    const policyDocument = policy["PolicyDocument"];

    if (
      typeof policyDocument !== "object" ||
      policyDocument === null ||
      Array.isArray(policyDocument)
    ) {
      throw new TypeError(
        `Invalid ${this.resourceType} ${resource.logicalId}: Policies entry PolicyDocument must be an object`,
      );
    }

    return {
      policyName,
      policyDocument: JSON.stringify(policyDocument),
    };
  }
}
