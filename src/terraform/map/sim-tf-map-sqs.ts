import {
  properties,
  renamed,
  tags,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import type { TerraformMappedResource } from "../sim-tf-mapping.type.js";
import { jsonDocument } from "./sim-tf-map-sqs-redrive.js";

/**
 * A queue, with the redrive policy read out of the JSON string it lives in.
 *
 * A queue can also state its redrive settings as resources of their own, and
 * those fold in beside this. The queue's own attribute is the older spelling
 * and the two never appear together on one queue.
 */
export function sqsQueue(
  context: TerraformMappingContext,
): TerraformMappedResource {
  const redrive = jsonDocument(context, "redrive_policy");

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
