import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLogsLogGroup } from "../../group/sim-logs-log-group.js";
import type { SimLogs } from "../../sim-logs.js";
import { SimCfnLogGroupProperties } from "./sim-cfn-log-group-properties.js";

interface SimCfnLogGroupCreatorProperties {
  readonly logs: SimLogs;
}

/**
 * Creates simulated log groups from AWS::Logs::LogGroup Resources.
 *
 * A declared log group and one a Lambda function made for itself are the same
 * thing, which is why creating one that is already there is not an error here
 * the way `CreateLogGroup` is. A template naming `/aws/lambda/orders` is
 * usually saying what retention that function's logs should have, and it is
 * ordinary for the function to have logged first: real CloudFormation fails
 * that deploy, which is a genuine misconfiguration in an account and pure
 * noise in a test whose function ran during setup.
 */
export class SimCfnLogGroupCreator {
  readonly #logs: SimLogs;

  constructor(properties: SimCfnLogGroupCreatorProperties) {
    this.#logs = properties.logs;
  }

  /**
   * Create a log group from an AWS::Logs::LogGroup Resource.
   */
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimLogsLogGroup {
    const logGroupProperties = new SimCfnLogGroupProperties({
      resource,
      properties,
    });
    const logGroupName = logGroupProperties.logGroupName();
    const retentionInDays = logGroupProperties.retentionInDays();

    logGroupProperties.recordIgnoredProperties();

    const group = this.#logs.serviceWriter().logGroup(logGroupName);

    group.setRetention(retentionInDays);

    return group;
  }

  /**
   * Delete a log group created from an AWS::Logs::LogGroup Resource.
   *
   * The events go with it, as they do in an account.
   */
  delete(group: SimLogsLogGroup): void {
    this.#logs.serviceWriter().deleteLogGroup(group.logGroupName);
  }
}
