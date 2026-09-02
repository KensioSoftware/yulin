import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimCfnTemplateValue } from "../../template/value/sim-cfn-template-value.js";
import { simAwsLocalConfig } from "../../../../serve/http/local-server/sim-aws-local.config.js";
import { DEFAULT_SIM_AWS_ACCOUNT_ID } from "../../../aws/sim-aws-account.js";
import { DEFAULT_SIM_AWS_REGION_NAME } from "../../../aws/sim-aws-region.js";

interface SimCfnPseudoParametersProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope | undefined;
  readonly stackName?: string | undefined;

  /**
   * The Stack's unique ID, for a template being resolved for a Stack that has
   * one. A template resolved outside a Stack has none, and reads `AWS::StackId`
   * as the Stack name, which is the closest thing to an identity it has.
   */
  readonly stackId?: string | undefined;
}

/**
 * Resolves CloudFormation pseudo parameters for one simulated Stack scope.
 */
export class SimCfnPseudoParameters {
  private readonly accountRegionScope: SimAwsAccountRegionScope | undefined;
  private readonly stackName: string | undefined;
  private readonly stackId: string | undefined;

  constructor(properties: SimCfnPseudoParametersProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.stackName = properties.stackName;
    this.stackId = properties.stackId;
  }

  /**
   * Resolve a supported CloudFormation pseudo parameter.
   */
  value(name: string): SimCfnTemplateValue | undefined {
    switch (name) {
      case "AWS::AccountId": {
        return this.accountRegionScope?.accountId ?? DEFAULT_SIM_AWS_ACCOUNT_ID;
      }

      case "AWS::Region": {
        return (
          this.accountRegionScope?.regionName ?? DEFAULT_SIM_AWS_REGION_NAME
        );
      }

      case "AWS::Partition": {
        return "aws";
      }

      case "AWS::StackName": {
        return this.stackName;
      }

      case "AWS::StackId": {
        return this.stackId ?? this.stackName;
      }

      case "AWS::NotificationARNs": {
        return [];
      }

      case "AWS::NoValue": {
        return "";
      }

      case "AWS::URLSuffix": {
        return simAwsLocalConfig.hostname;
      }

      default: {
        return undefined;
      }
    }
  }
}
