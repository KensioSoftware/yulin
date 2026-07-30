import type { SimCognitoGroup } from "../../../../cognito/user-pool/group/sim-cognito-group.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimCognitoUserPoolGroupCfnProperties {
  readonly group: SimCognitoGroup;
}

/**
 * CloudFormation-facing values for a simulated Cognito group.
 */
export class SimCognitoUserPoolGroupCfn implements SimCfnResourceValueAdapter {
  private readonly group: SimCognitoGroup;

  constructor(properties: SimCognitoUserPoolGroupCfnProperties) {
    this.group = properties.group;
  }

  /**
   * AWS::Cognito::UserPoolGroup Ref returns the group name, which is what
   * every group operation names the group by. A group has no id or ARN of its
   * own.
   */
  refValue(): SimCfnTemplateValue {
    return this.group.name;
  }

  /**
   * AWS::Cognito::UserPoolGroup publishes no Fn::GetAtt attributes.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    throw new Error(
      `Unsupported AWS::Cognito::UserPoolGroup attribute ${attributeName}`,
    );
  }
}
