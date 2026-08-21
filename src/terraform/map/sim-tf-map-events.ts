/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  attribute,
  properties,
  renamed,
  tags,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import type {
  TerraformMappedResource,
  TerraformResourceFold,
} from "../sim-tf-mapping.type.js";

/**
 * A rule.
 *
 * Tags are left off. Simulated EventBridge refuses a `Tags` property outright,
 * because a rule's tags never reach PutRule and a tagged rule would otherwise
 * deploy and lose them without a word, so a rule carrying tags fails the Stack
 * around it rather than only itself.
 *
 * Terraform carries the enabled state twice. `state` is the current spelling
 * and `is_enabled` is the boolean the provider deprecated in favour of it.
 */
export function eventRule(
  context: TerraformMappingContext,
): TerraformMappedResource {
  const state = ruleState(context);

  return {
    Type: "AWS::Events::Rule",
    Properties: {
      ...renamed(context, {
        Name: "name",
        Description: "description",
        ScheduleExpression: "schedule_expression",
        EventBusName: "event_bus_name",
      }),
      ...properties({ State: state, EventPattern: eventPattern(context) }),
    },
    lost: [
      ...(tags(context) === undefined ? [] : ["tags"]),
      ...(state === undefined && attribute(context, "state") !== undefined
        ? ["state"]
        : []),
    ],
  };
}

/**
 * Whether the rule matches events.
 *
 * `ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS` is left off and recorded.
 * Simulated EventBridge refuses it, because nothing here delivers CloudTrail
 * management events, and a rule in that state behaves exactly like an enabled
 * one. Enabled is what it gets.
 *
 * `is_enabled` is read where the configuration used the older spelling. A rule
 * deployed enabled that the plan disabled would fire on a schedule the
 * configuration turned off.
 */
function ruleState(
  context: TerraformMappingContext,
): SimCfnTemplateValue | undefined {
  const state = attribute(context, "state");

  if (state === "ENABLED" || state === "DISABLED") {
    return state;
  }

  if (state === undefined && attribute(context, "is_enabled") === false) {
    return "DISABLED";
  }

  return undefined;
}

/**
 * The pattern the rule matches events against, which Terraform carries as a
 * JSON string and CloudFormation as an object.
 *
 * Simulated EventBridge takes either, so a pattern the plan resolved goes
 * across as it stands. One built around a resource of the same plan is unknown
 * whole, and there is no pattern to send.
 */
function eventPattern(
  context: TerraformMappingContext,
): SimCfnTemplateValue | undefined {
  const pattern = attribute(context, "event_pattern");

  return typeof pattern === "string" ? pattern : undefined;
}

/**
 * The target resources, which Terraform declares apart from the rule they
 * belong to.
 *
 * CloudFormation holds them as one `Targets` list on the rule, so each fold
 * adds an entry to what is already there rather than replacing it. A rule with
 * three targets is three Terraform resources and one `AWS::Events::Rule`.
 */
export const eventTargetFolds: ReadonlyMap<string, TerraformResourceFold> =
  new Map([
    [
      "aws_cloudwatch_event_target",
      { parentAttribute: "rule", properties: target, lost: targetLost },
    ],
  ]);

/**
 * The ways a target can be configured that this fold does not carry.
 *
 * Simulated EventBridge refuses each of them by name on a Resource, so a
 * target declaring one is added without it and the attribute recorded. Every
 * one changes what the target receives or what happens when a delivery fails,
 * which is the kind of difference a test would otherwise read as working.
 */
const unsimulatedTargetAttributes = [
  "input_path",
  "input_transformer",
  "dead_letter_config",
  "retry_policy",
  "role_arn",
];

/**
 * One entry of the rule's `Targets` list.
 *
 * A target whose ARN the plan could not resolve contributes nothing rather
 * than an entry with no ARN, which is one simulated EventBridge refuses along
 * with the whole rule. `target_id` is optional in Terraform and generated at
 * apply time when it is left out, so a target with no id of its own is named
 * after the resource declaring it, which is the identifier the plan does carry.
 */
function target(
  context: TerraformMappingContext,
  parent: Record<string, SimCfnTemplateValue> = {},
): Record<string, SimCfnTemplateValue> {
  const arn = attribute(context, "arn");

  if (arn === undefined) {
    return {};
  }

  const entry = properties({
    Id: attribute(context, "target_id") ?? context.resource.name,
    Arn: arn,
    Input: attribute(context, "input"),
  });

  return { Targets: [...existingTargets(parent), entry] };
}

/** The attributes of one target this fold could not carry across. */
function targetLost(context: TerraformMappingContext): readonly string[] {
  const configured = unsimulatedTargetAttributes.filter((name) =>
    configuredValue(context.resource.values[name]),
  );

  return attribute(context, "arn") === undefined
    ? ["arn", ...configured]
    : configured;
}

/**
 * Whether an attribute holds anything.
 *
 * The provider writes an absent nested block as an empty list and an absent
 * top-level optional as null, so both spellings of "not configured" are here.
 */
function configuredValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== null && value !== undefined;
}

/** The targets an earlier fold on the same rule already added. */
function existingTargets(
  parent: Record<string, SimCfnTemplateValue>,
): readonly SimCfnTemplateValue[] {
  const targets = parent["Targets"];

  return Array.isArray(targets)
    ? targets.filter((entry) => isRecord(entry))
    : [];
}
