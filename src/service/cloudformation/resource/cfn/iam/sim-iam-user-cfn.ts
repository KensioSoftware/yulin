import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimIamUser } from "../../../../iam/user/sim-iam-user.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimIamUserCfnProperties {
  readonly user: SimIamUser;
}

/**
 * CloudFormation-facing behaviour for an AWS::IAM::User Resource.
 *
 * Keeps IAM user objects free of CloudFormation intrinsic-function concerns
 * while exposing the correct Ref and Fn::GetAtt values.
 */
export class SimIamUserCfn implements SimCfnResourceValueAdapter {
  private readonly user: SimIamUser;

  constructor(properties: SimIamUserCfnProperties) {
    this.user = properties.user;
  }

  /**
   * CloudFormation Ref for AWS::IAM::User returns the user name.
   */
  refValue(): SimCfnTemplateValue {
    return this.user.userName;
  }

  /**
   * CloudFormation attributes for AWS::IAM::User.
   *
   * AWS::IAM::User supports Fn::GetAtt for Arn and UserId.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Arn") {
      return this.user.arn;
    }

    if (attributeName === "UserId") {
      return this.user.userId;
    }

    return `${this.user.arn}.${attributeName}`;
  }
}
