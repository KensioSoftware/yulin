import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimIamRole } from "../../../../iam/role/sim-iam-role.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimIamRoleCfnProps {
  readonly role: SimIamRole;
}

/**
 * CloudFormation-facing behaviour for an AWS::IAM::Role Resource.
 *
 * Keeps IAM role objects free of CloudFormation intrinsic-function concerns
 * while exposing the correct Ref and Fn::GetAtt values.
 */
export class SimIamRoleCfn implements SimCfnResourceValueAdapter {
  private readonly role: SimIamRole;

  constructor(props: SimIamRoleCfnProps) {
    this.role = props.role;
  }

  /**
   * CloudFormation Ref for AWS::IAM::Role returns the role name.
   */
  refValue(): SimCfnTemplateValue {
    return this.role.roleName;
  }

  /**
   * CloudFormation attributes for AWS::IAM::Role.
   *
   * AWS::IAM::Role supports Fn::GetAtt for Arn and RoleId.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Arn") {
      return this.role.arn;
    }

    if (attributeName === "RoleId") {
      return this.role.roleId;
    }

    return `${this.role.arn}.${attributeName}`;
  }
}
