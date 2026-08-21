/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import {
  field,
  properties,
  renamed,
  tags,
  templateValue,
  type TerraformMappingContext,
} from "./sim-tf-attributes.js";
import type { TerraformMappedResource } from "./sim-tf-mapping.type.js";

/** A queue, with the redrive policy read out of the JSON string it lives in. */
export function sqsQueue(
  context: TerraformMappingContext,
): TerraformMappedResource {
  const redrive = redrivePolicy(context);

  return {
    Type: "AWS::SQS::Queue",
    Properties: {
      ...renamed(context, {
        QueueName: "name",
        VisibilityTimeout: "visibility_timeout_seconds",
        MessageRetentionPeriod: "message_retention_seconds",
        DelaySeconds: "delay_seconds",
      }),
      ...properties({ RedrivePolicy: redrive.value, Tags: tags(context) }),
    },
    lost: redrive.lost,
  };
}

interface RedriveResult {
  readonly value: SimCfnTemplateValue | undefined;
  readonly lost: readonly string[];
}

/**
 * The queue's redrive policy, which Terraform carries as a JSON string.
 *
 * The string is built with `jsonencode` around the dead-letter queue's ARN, so
 * the whole string is unknown whenever that queue is created by the same plan.
 * What survives is the reference. The `maxReceiveCount` beside it was inside
 * the string that never got built.
 */
function redrivePolicy(context: TerraformMappingContext): RedriveResult {
  const known = field(context.resource.values, "redrive_policy");

  if (typeof known === "string") {
    const parsed: unknown = JSON.parse(known);

    return {
      value: isRecord(parsed) ? templateValue(parsed) : undefined,
      lost: [],
    };
  }

  /*
   * The dead-letter queue is recoverable from the reference and the receive
   * limit is not, and a redrive policy carrying a made-up limit would give the
   * queue different retry behaviour from the one the plan describes. The whole
   * policy is dropped and recorded instead.
   */
  return {
    value: undefined,
    lost:
      context.resource.unknown["redrive_policy"] === true
        ? ["redrive_policy"]
        : [],
  };
}
