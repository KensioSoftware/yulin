import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimIamInstanceProfile } from "../../../../iam/instance-profile/sim-iam-instance-profile.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

/**
 * CloudFormation-facing behaviour for an AWS::IAM::InstanceProfile Resource.
 *
 * `Ref` answers the instance profile name, and `Fn::GetAtt` answers `Arn`.
 */
export class SimIamInstanceProfileCfn implements SimCfnResourceValueAdapter {
  constructor(private readonly profile: SimIamInstanceProfile) {}

  /**
   * CloudFormation Ref for AWS::IAM::InstanceProfile returns its name.
   */
  refValue(): SimCfnTemplateValue {
    return this.profile.instanceProfileName;
  }

  /**
   * CloudFormation attributes for AWS::IAM::InstanceProfile.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    return attributeName === "Arn"
      ? this.profile.arn
      : `${this.profile.arn}.${attributeName}`;
  }
}
