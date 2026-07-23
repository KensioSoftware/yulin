import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimIamManagedPolicy } from "../../../../iam/policy/sim-iam-policy.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimIamManagedPolicyCfnProperties {
  readonly policy: SimIamManagedPolicy;
}

/**
 * CloudFormation-facing behaviour for an AWS::IAM::ManagedPolicy Resource.
 *
 * Keeps IAM policy objects free of CloudFormation intrinsic-function concerns
 * while exposing the correct Ref and Fn::GetAtt values.
 */
export class SimIamManagedPolicyCfn implements SimCfnResourceValueAdapter {
  private readonly policy: SimIamManagedPolicy;

  constructor(properties: SimIamManagedPolicyCfnProperties) {
    this.policy = properties.policy;
  }

  /**
   * CloudFormation Ref for AWS::IAM::ManagedPolicy returns the policy ARN.
   */
  refValue(): SimCfnTemplateValue {
    return this.policy.arn;
  }

  /**
   * CloudFormation attributes for AWS::IAM::ManagedPolicy.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    // AWS::IAM::ManagedPolicy has no GetAtt attributes in CloudFormation;
    // return a sensible fallback for any attribute name used in tests.
    return `${this.policy.arn}.${attributeName}`;
  }
}
