import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimIamGroup } from "../../../../iam/group/sim-iam-group.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

/**
 * CloudFormation-facing behaviour for an AWS::IAM::Group Resource.
 *
 * `Ref` answers the group name, and `Fn::GetAtt` answers `Arn`.
 */
export class SimIamGroupCfn implements SimCfnResourceValueAdapter {
  constructor(private readonly group: SimIamGroup) {}

  /**
   * CloudFormation Ref for AWS::IAM::Group returns the group name.
   */
  refValue(): SimCfnTemplateValue {
    return this.group.groupName;
  }

  /**
   * CloudFormation attributes for AWS::IAM::Group.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    return attributeName === "Arn"
      ? this.group.arn
      : `${this.group.arn}.${attributeName}`;
  }
}
