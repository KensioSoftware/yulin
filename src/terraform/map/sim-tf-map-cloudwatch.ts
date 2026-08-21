/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import {
  properties,
  renamed,
  tags,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import { attributeList } from "../sim-tf-nested-attributes.js";
import { alarmDimensions } from "./sim-tf-map-cloudwatch-dimensions.js";
import type { TerraformMappedResource } from "../sim-tf-mapping.type.js";

/**
 * The properties simulated CloudWatch will not create an alarm without.
 *
 * They are the same seven PutMetricAlarm requires, and an alarm missing one
 * fails the Stack around it rather than only itself. Naming them here is also
 * what steps over the two alarm shapes this simulation does not evaluate: an
 * alarm built out of `metric_query` blocks carries no namespace, metric name
 * or statistic of its own, and one watching a percentile carries an
 * `extended_statistic` in place of its `statistic`.
 */
const required = [
  "Namespace",
  "MetricName",
  "Statistic",
  "Period",
  "EvaluationPeriods",
  "Threshold",
  "ComparisonOperator",
];

/**
 * A metric alarm.
 *
 * Tags go across as they were written. The CloudFormation layer records them
 * against the Resource and never passes them to PutMetricAlarm, which is the
 * one place they would be refused, so a tagged alarm deploys and says that
 * nothing reads its tags.
 */
export function metricAlarm(
  context: TerraformMappingContext,
): TerraformMappedResource {
  const identified = alarmDimensions(context);

  return {
    Type: "AWS::CloudWatch::Alarm",
    Properties: {
      ...renamed(context, {
        AlarmName: "alarm_name",
        AlarmDescription: "alarm_description",
        Namespace: "namespace",
        MetricName: "metric_name",
        Statistic: "statistic",
        Unit: "unit",
        Period: "period",
        EvaluationPeriods: "evaluation_periods",
        DatapointsToAlarm: "datapoints_to_alarm",
        Threshold: "threshold",
        ComparisonOperator: "comparison_operator",
        TreatMissingData: "treat_missing_data",
        ActionsEnabled: "actions_enabled",
      }),
      ...properties({
        Dimensions: identified.value,
        AlarmActions: attributeList(context, "alarm_actions"),
        OKActions: attributeList(context, "ok_actions"),
        InsufficientDataActions: attributeList(
          context,
          "insufficient_data_actions",
        ),
        Tags: tags(context),
      }),
    },
    requires: required,
    lost: identified.lost,
  };
}
