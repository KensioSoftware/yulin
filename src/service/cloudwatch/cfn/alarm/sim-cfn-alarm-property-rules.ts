import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The properties an alarm Resource is read from.
 *
 * The last four are read only to be refused. They go to PutMetricAlarm as the
 * template wrote them, so a template asking for metric math or an anomaly band
 * is turned down in the same words an SDK caller gets.
 */
const readProperties = new Set([
  "ActionsEnabled",
  "AlarmActions",
  "AlarmDescription",
  "AlarmName",
  "ComparisonOperator",
  "DatapointsToAlarm",
  "Dimensions",
  "EvaluationPeriods",
  "InsufficientDataActions",
  "MetricName",
  "Namespace",
  "OKActions",
  "Period",
  "Statistic",
  "Threshold",
  "TreatMissingData",
  "Unit",
  "EvaluateLowSampleCountPercentile",
  "ExtendedStatistic",
  "Metrics",
  "ThresholdMetricId",
]);

/**
 * The AWS::CloudWatch::Alarm properties this simulation has nothing to act on,
 * and why.
 *
 * `Tags` is the whole list, and it is recorded rather than refused, unlike the
 * same parameter on PutMetricAlarm. An SDK caller passing tags asked for them;
 * a template's tags are usually the stack's, applied to every Resource in it,
 * and failing a deploy over one would take down an alarm that behaves no
 * differently for having it.
 */
const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "Tags",
    "alarm tags are not simulated, so nothing reads them back and nothing is " +
      "grouped or billed by them",
  ],
]);

interface SimCfnAlarmPropertyRulesProperties {
  readonly properties: SimCfnTemplateValueRecord;
  readonly ignorer: SimCfnPropertyIgnorer;
}

/**
 * What an alarm Resource is created without acting on.
 */
export class SimCfnAlarmPropertyRules {
  readonly #properties: SimCfnTemplateValueRecord;
  readonly #ignorer: SimCfnPropertyIgnorer;

  constructor(properties: SimCfnAlarmPropertyRulesProperties) {
    this.#properties = properties.properties;
    this.#ignorer = properties.ignorer;
  }

  /**
   * Record every property the alarm is created without.
   */
  apply(): void {
    for (const name of Object.keys(this.#properties)) {
      this.applyToProperty(name);
    }
  }

  private applyToProperty(name: string): void {
    if (readProperties.has(name)) {
      return;
    }

    const unsimulatedReason = unsimulatedPropertyReasons.get(name);

    if (unsimulatedReason === undefined) {
      this.#ignorer.ignoreProperty(
        name,
        `${name} is not a property simulated CloudWatch knows about, so the ` +
          `alarm is created without it`,
      );

      return;
    }

    this.#ignorer.ignoreProperty(
      name,
      `${name} is a real AWS::CloudWatch::Alarm property simulated ` +
        `CloudWatch does not act on: ${unsimulatedReason}`,
    );
  }
}
