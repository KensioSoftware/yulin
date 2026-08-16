import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimPutMetricAlarmCommandInput } from "../../command/alarm/alarm.command.js";
import { simCloudWatchMaximumNameLength } from "../../metric/sim-cloudwatch-name.js";
import { SimCfnAlarmPropertyRules } from "./sim-cfn-alarm-property-rules.js";
import { SimCfnAlarmValues } from "./sim-cfn-alarm-values.js";

interface SimCfnAlarmPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::CloudWatch::Alarm CloudFormation properties into the request
 * PutMetricAlarm takes.
 *
 * Nothing is decided here beyond the shapes the template wrote. An alarm a
 * stack deployed is created through the ordinary command, so it evaluates,
 * fires and refuses exactly as one an SDK caller asked for.
 */
export class SimCfnAlarmProperties {
  readonly #resource: SimCfnResource;
  readonly #values: SimCfnAlarmValues;
  readonly #rules: SimCfnAlarmPropertyRules;

  constructor(properties: SimCfnAlarmPropertiesProperties) {
    this.#resource = properties.resource;
    this.#values = new SimCfnAlarmValues({
      logicalId: properties.resource.logicalId,
      properties: properties.properties,
    });
    this.#rules = new SimCfnAlarmPropertyRules({
      properties: properties.properties,
      ignorer: properties.resource,
    });
  }

  /**
   * The PutMetricAlarm request this Resource declares.
   */
  input(): SimPutMetricAlarmCommandInput {
    return {
      AlarmName: this.alarmName(),
      AlarmDescription: this.#values.string("AlarmDescription"),
      ActionsEnabled: this.#values.boolean("ActionsEnabled"),
      OKActions: this.#values.strings("OKActions"),
      AlarmActions: this.#values.strings("AlarmActions"),
      InsufficientDataActions: this.#values.strings("InsufficientDataActions"),
      Namespace: this.#values.string("Namespace"),
      MetricName: this.#values.string("MetricName"),
      Dimensions: this.#values.dimensions(),
      Statistic: this.#values.string("Statistic"),
      Unit: this.#values.string("Unit"),
      Period: this.#values.number("Period"),
      EvaluationPeriods: this.#values.number("EvaluationPeriods"),
      DatapointsToAlarm: this.#values.number("DatapointsToAlarm"),
      Threshold: this.#values.number("Threshold"),
      ComparisonOperator: this.#values.string("ComparisonOperator"),
      TreatMissingData: this.#values.string("TreatMissingData"),
      Metrics: this.#values.list("Metrics"),
      ThresholdMetricId: this.#values.string("ThresholdMetricId"),
      ExtendedStatistic: this.#values.string("ExtendedStatistic"),
      EvaluateLowSampleCountPercentile: this.#values.string(
        "EvaluateLowSampleCountPercentile",
      ),
    };
  }

  /**
   * Record the properties the alarm is created without acting on.
   */
  recordIgnoredProperties(): void {
    this.#rules.apply();
  }

  /**
   * The alarm name.
   *
   * An unnamed alarm is named after the stack and the logical ID, as real
   * CloudFormation names one. An alarm name is the whole of its identity in a
   * region, so a template that leaves it out still has to deploy something a
   * test can name in `DescribeAlarms`.
   */
  private alarmName(): string {
    return (
      this.#values.string("AlarmName") ??
      new SimCfnGeneratedResourceName({
        stackName: this.#resource.stackName,
        logicalId: this.#resource.logicalId,
        maximumLength: simCloudWatchMaximumNameLength,
      }).value
    );
  }
}
