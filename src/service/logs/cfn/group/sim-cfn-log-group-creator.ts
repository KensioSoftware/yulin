import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimLogsResourceAlreadyExistsException } from "../../error/sim-logs.error.js";
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
 *
 * The commands are still the ones an SDK caller would have used. The
 * deployment's caller is authorized for `logs:CreateLogGroup` and
 * `logs:PutRetentionPolicy`, as it is on a real deploy. A group that is
 * already there changes what happens after that decision (the refusal is
 * caught) and never whether one is made.
 */
export class SimCfnLogGroupCreator {
  readonly #logs: SimLogs;

  constructor(properties: SimCfnLogGroupCreatorProperties) {
    this.#logs = properties.logs;
  }

  /**
   * Create a log group from an AWS::Logs::LogGroup Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimLogsLogGroup> {
    const logGroupProperties = new SimCfnLogGroupProperties({
      resource,
      properties,
    });
    const logGroupName = logGroupProperties.logGroupName();
    const retentionInDays = logGroupProperties.retentionInDays();

    logGroupProperties.recordIgnoredProperties();

    await this.#createOrAdopt(logGroupName, options);

    if (retentionInDays !== undefined) {
      await this.#logs.putRetentionPolicy(
        { input: { logGroupName, retentionInDays } },
        options,
      );
    }

    const group = this.#logs.findLogGroup(logGroupName);
    assertDefined(
      group,
      `sim log group ${logGroupName} after CloudFormation creation`,
    );

    return group;
  }

  /**
   * Delete a log group created from an AWS::Logs::LogGroup Resource.
   *
   * The events go with it, as they do in an account.
   */
  async delete(
    group: SimLogsLogGroup,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await this.#logs.deleteLogGroup(
      { input: { logGroupName: group.logGroupName } },
      options,
    );
  }

  /**
   * Make the log group, or leave the one already under that name where it is.
   *
   * The refusal is the one `CreateLogGroup` answers a taken name with. It is
   * raised after the caller has been authorized. A deployment denied
   * `logs:CreateLogGroup` therefore fails whether or not the group is there.
   */
  async #createOrAdopt(
    logGroupName: string,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    try {
      await this.#logs.createLogGroup({ input: { logGroupName } }, options);
    } catch (error) {
      if (!(error instanceof SimLogsResourceAlreadyExistsException)) {
        throw error;
      }
    }
  }
}
