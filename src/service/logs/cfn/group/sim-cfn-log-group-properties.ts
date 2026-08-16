import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { requiredSimLogsRetentionDays } from "../../group/sim-logs-retention.js";
import { SimCfnLogGroupPropertyRules } from "./sim-cfn-log-group-property-rules.js";

const maximumNameLength = 512;

/**
 * A refusal naming the Resource whose properties could not be read.
 */
export function logGroupPropertyError(
  logicalId: string,
  reason: string,
): Error {
  return new Error(
    `Invalid sim CloudWatch Logs CloudFormation Resource ${logicalId}: ${reason}`,
  );
}

interface SimCfnLogGroupPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::Logs::LogGroup CloudFormation properties.
 */
export class SimCfnLogGroupProperties {
  readonly #resource: SimCfnResource;
  readonly #properties: SimCfnTemplateValueRecord;
  readonly #rules: SimCfnLogGroupPropertyRules;

  constructor(properties: SimCfnLogGroupPropertiesProperties) {
    this.#resource = properties.resource;
    this.#properties = properties.properties;
    this.#rules = new SimCfnLogGroupPropertyRules({
      properties: properties.properties,
      ignorer: properties.resource,
    });
  }

  /**
   * The log group name.
   *
   * An unnamed log group is named after the stack and the logical ID, as real
   * CloudFormation names one. Nothing lower cases it, unlike a repository
   * name: a log group name keeps whatever case it was given.
   */
  logGroupName(): string {
    const name = this.#properties["LogGroupName"];

    if (name === undefined) {
      return new SimCfnGeneratedResourceName({
        stackName: this.#resource.stackName,
        logicalId: this.#resource.logicalId,
        maximumLength: maximumNameLength,
      }).value;
    }

    if (typeof name !== "string") {
      throw logGroupPropertyError(
        this.#resource.logicalId,
        "LogGroupName must be a string",
      );
    }

    return name;
  }

  /**
   * How long the log group keeps its events, or undefined where the template
   * sets no retention and they are kept forever.
   *
   * A value outside the set real CloudWatch Logs accepts fails the Resource.
   * That is the mistake this property exists to catch: `RetentionInDays: 10`
   * looks reasonable, is refused by an account, and would otherwise only be
   * found on a real deploy.
   */
  retentionInDays(): number | undefined {
    const retention = this.#properties["RetentionInDays"];

    if (retention === undefined) {
      return undefined;
    }

    if (typeof retention !== "number") {
      throw logGroupPropertyError(
        this.#resource.logicalId,
        "RetentionInDays must be a number",
      );
    }

    return requiredSimLogsRetentionDays(retention);
  }

  /**
   * Record the properties the log group is created without acting on.
   */
  recordIgnoredProperties(): void {
    this.#rules.apply();
  }
}
