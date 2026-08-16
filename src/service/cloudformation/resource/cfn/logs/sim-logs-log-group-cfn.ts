import type { SimLogsLogGroup } from "../../../../logs/group/sim-logs-log-group.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimLogsLogGroupCfnProperties {
  readonly group: SimLogsLogGroup;
}

/**
 * CloudFormation-facing values for a simulated CloudWatch Logs log group.
 */
export class SimLogsLogGroupCfn implements SimCfnResourceValueAdapter {
  readonly #group: SimLogsLogGroup;

  constructor(properties: SimLogsLogGroupCfnProperties) {
    this.#group = properties.group;
  }

  /**
   * AWS::Logs::LogGroup Ref returns the log group name.
   */
  refValue(): SimCfnTemplateValue {
    return this.#group.logGroupName;
  }

  /**
   * AWS::Logs::LogGroup attributes.
   *
   * The ARN carries the trailing `:*` that covers the streams inside the
   * group, which is the form CloudFormation returns and the form a policy is
   * written against. A template granting a function permission on its own log
   * group through `Fn::GetAtt` therefore gets a resource that reaches the
   * streams, which is what makes the grant work.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Arn") {
      return this.#group.arn;
    }

    throw new Error(
      `Unsupported AWS::Logs::LogGroup attribute ${attributeName}`,
    );
  }
}
