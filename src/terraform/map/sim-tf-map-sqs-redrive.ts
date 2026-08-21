/*
 * The two ways a queue names its dead-letter arrangement as a resource of its
 * own, rather than inline on the queue.
 *
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  field,
  properties,
  templateValue,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import type { TerraformResourceFold } from "../sim-tf-mapping.type.js";

/** A policy document read out of the JSON string Terraform carries it in. */
export interface TerraformJsonDocument {
  readonly value: SimCfnTemplateValue | undefined;
  readonly lost: readonly string[];
}

/**
 * One attribute Terraform holds as a JSON string and CloudFormation as an
 * object.
 *
 * The string is usually built with `jsonencode` around a queue ARN, so the
 * whole string is unknown whenever that queue is created by the same plan. What
 * survives is the reference to the queue, and everything the document said
 * beside it was inside the string that never got built. A policy carrying a
 * made-up receive limit would give the queue different retry behaviour from the
 * one the plan describes, so the document is dropped whole and recorded.
 */
export function jsonDocument(
  context: TerraformMappingContext,
  key: string,
): TerraformJsonDocument {
  const known = field(context.resource.values, key);

  if (typeof known === "string") {
    const parsed: unknown = JSON.parse(known);

    return {
      value: isRecord(parsed) ? templateValue(parsed) : undefined,
      lost: [],
    };
  }

  return {
    value: undefined,
    lost: context.resource.unknown[key] === true ? [key] : [],
  };
}

/**
 * The `aws_sqs_queue_redrive_*` resources that configure a queue declared
 * elsewhere.
 *
 * Each names its queue in a `queue_url` attribute, which the queue resolves to
 * whether or not the URL itself was known at plan time. CloudFormation carries
 * both as properties of the `AWS::SQS::Queue`, and simulated SQS records each
 * one against the Resource: no message moves to a dead-letter queue here, and
 * nothing enforces which queues may name one as theirs.
 */
export const sqsRedriveFolds: ReadonlyMap<string, TerraformResourceFold> =
  new Map([
    [
      "aws_sqs_queue_redrive_policy",
      {
        parentAttribute: "queue_url",
        properties: (context) =>
          redrive(context, "redrive_policy", "RedrivePolicy"),
        lost: (context) => jsonDocument(context, "redrive_policy").lost,
      },
    ],
    [
      "aws_sqs_queue_redrive_allow_policy",
      {
        parentAttribute: "queue_url",
        properties: (context) =>
          redrive(context, "redrive_allow_policy", "RedriveAllowPolicy"),
        lost: (context) => jsonDocument(context, "redrive_allow_policy").lost,
      },
    ],
  ]);

function redrive(
  context: TerraformMappingContext,
  attribute: string,
  property: string,
): Record<string, SimCfnTemplateValue> {
  return properties({ [property]: jsonDocument(context, attribute).value });
}
