import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { assertDefined } from "../../util/type-guard/defined.js";
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import { terraformPlanResourceFactory } from "../../../test/terraform/plan/terraform-plan.factory.js";
import { terraformMappingContext as contextFor } from "../../../test/terraform/plan/terraform-mapping-context.js";
import type { TerraformMappingContext } from "../sim-tf-attributes.js";
import { terraformResourceFolds } from "../sim-tf-registry.js";
import { metricAlarm } from "./sim-tf-map-cloudwatch.js";
import { eventRule } from "./sim-tf-map-events.js";

/** The properties one fold contributes to the resource it configures. */
function foldedProperties(
  type: string,
  context: TerraformMappingContext,
  parent: Record<string, SimCfnTemplateValue> = {},
): Record<string, SimCfnTemplateValue> {
  const fold = terraformResourceFolds.get(type);

  assertDefined(fold, `A fold for ${type}`);

  return fold.properties(context, parent);
}

/** An alarm watching a queue, with everything CloudWatch requires stated. */
function alarmValues(values: Record<string, unknown>): Record<string, unknown> {
  return {
    alarm_name: "orders-dlq-depth",
    namespace: "AWS/SQS",
    metric_name: "ApproximateNumberOfMessagesVisible",
    statistic: "Maximum",
    period: 300,
    evaluation_periods: 1,
    threshold: 0,
    comparison_operator: "GreaterThanThreshold",
    ...values,
  };
}

describe("mapping a CloudWatch metric alarm", () => {
  it("rebuilds the dimensions as the list CloudFormation holds", () => {
    // Given an alarm whose dimensions Terraform states as a map
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cloudwatch_metric_alarm",
          name: "dlq_depth",
          values: alarmValues({
            dimensions: { QueueName: "orders-processing-dlq" },
          }),
        }),
      ],
    });

    // When it is mapped
    // Then each entry is a name and value pair
    assertObjectEquals(metricAlarm(context).Properties["Dimensions"], [
      { Name: "QueueName", Value: "orders-processing-dlq" },
    ]);
  });

  it("drops a dimension whose value the plan could not resolve", () => {
    // Given an alarm one of whose dimension values stayed unknown. The
    // references survive for the map rather than per key, so which dimension a
    // resolved value belongs to is not in the plan
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cloudwatch_metric_alarm",
          name: "dlq_depth",
          values: alarmValues({
            dimensions: { QueueName: undefined, Stage: "test" },
          }),
        }),
      ],
    });
    const mapped = metricAlarm(context);

    // When it is mapped
    // Then the dimension with no value is left out, since PutMetricAlarm
    // refuses one, and the map is recorded
    assertObjectEquals(mapped.Properties["Dimensions"], [
      { Name: "Stage", Value: "test" },
    ]);
    assertArrayEquals(mapped.lost ?? [], ["dimensions"]);
  });

  it("resolves the topic an alarm notifies into a list of one", () => {
    // Given an alarm whose actions name a topic of the same plan, so the
    // whole list arrives unknown
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cloudwatch_metric_alarm",
          name: "dlq_depth",
          values: alarmValues({}),
          unknown: { alarm_actions: true },
          references: {
            alarm_actions: ["aws_sns_topic.alerts.arn", "aws_sns_topic.alerts"],
          },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_sns_topic",
          name: "alerts",
          values: { name: "orders-alerts" },
        }),
      ],
    });

    // When it is mapped
    // Then the actions are a list holding what the reference resolves to.
    // Terraform lists the attribute form and the bare resource form of one
    // reference, and both give the same topic ARN, so the alarm notifies one
    // topic rather than the same topic twice
    assertObjectEquals(metricAlarm(context).Properties["AlarmActions"], [
      { Ref: "AwsSnsTopicAlerts" },
    ]);
  });

  it("requires what PutMetricAlarm requires", () => {
    // Given an alarm built out of metric_query blocks, which carries no
    // namespace, metric name or statistic of its own
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cloudwatch_metric_alarm",
          name: "composite",
          values: {
            alarm_name: "orders-composite",
            evaluation_periods: 1,
            threshold: 1,
            comparison_operator: "GreaterThanThreshold",
          },
        }),
      ],
    });
    const mapped = metricAlarm(context);

    // When it is mapped
    // Then the properties it could not fill are named, so settling leaves the
    // alarm out rather than failing the Stack around it
    assertUndefined(mapped.Properties["Namespace"]);
    assertArrayEquals(mapped.requires ?? [], [
      "Namespace",
      "MetricName",
      "Statistic",
      "Period",
      "EvaluationPeriods",
      "Threshold",
      "ComparisonOperator",
    ]);
  });
});

describe("mapping an EventBridge rule", () => {
  it("records the tags simulated EventBridge refuses", () => {
    // Given a tagged rule. Rule tags never reach PutRule, so a tagged rule
    // would otherwise deploy and lose them without a word, and simulated
    // EventBridge refuses the property rather than let that happen
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cloudwatch_event_rule",
          name: "nightly",
          values: {
            name: "orders-nightly",
            schedule_expression: "cron(0 2 * * ? *)",
            tags_all: { Application: "orders" },
          },
        }),
      ],
    });
    const mapped = eventRule(context);

    // When it is mapped
    // Then no Tags property is sent and the attribute is recorded
    assertUndefined(mapped.Properties["Tags"]);
    assertArrayEquals(mapped.lost ?? [], ["tags"]);
  });

  it("records a rule state simulated EventBridge refuses", () => {
    // Given a rule matching CloudTrail management events, which nothing here
    // delivers
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cloudwatch_event_rule",
          name: "audit",
          values: {
            name: "orders-audit",
            state: "ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS",
          },
        }),
      ],
    });
    const mapped = eventRule(context);

    // When it is mapped
    // Then no State is sent and the attribute is recorded. The rule is enabled,
    // which is what simulated EventBridge says the state amounts to here
    assertUndefined(mapped.Properties["State"]);
    assertArrayEquals(mapped.lost ?? [], ["state"]);
  });

  it("disables a rule the configuration turned off by the older attribute", () => {
    // Given a rule using `is_enabled`, which the provider deprecated in favour
    // of `state`
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cloudwatch_event_rule",
          name: "nightly",
          values: {
            name: "orders-nightly",
            schedule_expression: "cron(0 2 * * ? *)",
            is_enabled: false,
          },
        }),
      ],
    });

    // When it is mapped
    // Then the rule is disabled, rather than firing on a schedule the
    // configuration turned off
    assertIdentical(eventRule(context).Properties["State"], "DISABLED");
  });

  it("adds each target to the list the rule already carries", () => {
    // Given two targets of one rule, which Terraform declares as two
    // resources and CloudFormation holds as one Targets list
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cloudwatch_event_target",
          name: "reporter",
          values: { rule: "orders-nightly", target_id: "reporter", arn: "b" },
        }),
      ],
    });

    // When the second is folded into a rule the first already contributed to
    // Then it is added rather than replacing what is there
    assertObjectEquals(
      foldedProperties("aws_cloudwatch_event_target", context, {
        Targets: [{ Id: "processor", Arn: "a" }],
      }),
      {
        Targets: [
          { Id: "processor", Arn: "a" },
          { Id: "reporter", Arn: "b" },
        ],
      },
    );
  });

  it("names a target after the resource declaring it when it has no id", () => {
    // Given a target with no target_id, which Terraform generates at apply
    // time and the plan therefore leaves unknown
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cloudwatch_event_target",
          name: "nightly_processor",
          values: { rule: "orders-nightly", arn: "a" },
          unknown: { target_id: true },
        }),
      ],
    });

    // When it is folded
    // Then it is named after the resource, since simulated EventBridge refuses
    // a target with no Id and the resource name is the identifier the plan
    // does carry
    assertObjectEquals(
      foldedProperties("aws_cloudwatch_event_target", context),
      { Targets: [{ Id: "nightly_processor", Arn: "a" }] },
    );
  });

  it("contributes no target whose ARN the plan could not resolve", () => {
    // Given a target naming a function the template does not declare
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cloudwatch_event_target",
          name: "nightly_processor",
          values: { rule: "orders-nightly", target_id: "processor" },
          unknown: { arn: true },
          references: { arn: ["aws_lambda_function.processor.arn"] },
        }),
      ],
    });
    const fold = terraformResourceFolds.get("aws_cloudwatch_event_target");

    assertDefined(fold, "A fold for aws_cloudwatch_event_target");

    // When it is folded
    // Then nothing is added, since a target with no Arn is one simulated
    // EventBridge refuses along with the rule holding it, and the attribute is
    // recorded
    assertObjectEquals(fold.properties(context, {}), {});
    assertArrayEquals(fold.lost?.(context) ?? [], ["arn"]);
  });

  it("records the target settings simulated EventBridge does not act on", () => {
    // Given a target transforming the event before it is delivered
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cloudwatch_event_target",
          name: "nightly_processor",
          values: {
            rule: "orders-nightly",
            target_id: "processor",
            arn: "a",
            input_path: "$.detail",
            input_transformer: [],
            dead_letter_config: [],
            retry_policy: [],
            role_arn: null,
          },
        }),
      ],
    });
    const fold = terraformResourceFolds.get("aws_cloudwatch_event_target");

    assertDefined(fold, "A fold for aws_cloudwatch_event_target");

    // When it is folded
    // Then the target is added without it and the attribute recorded, since a
    // target receiving the whole event where the plan asked for one field of
    // it is the kind of difference a test reads as working
    assertArrayEquals(fold.lost?.(context) ?? [], ["input_path"]);
  });
});
