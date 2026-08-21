/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import {
  attribute,
  renamed,
  tags,
  type TerraformMappingContext,
} from "./sim-tf-attributes.js";
import type { TerraformMappedResource } from "./sim-tf-mapping.type.js";

/**
 * A topic.
 *
 * Tags are left off. Simulated SNS refuses a `Tags` property, because nothing
 * it models reads a topic tag, and Terraform tags whatever a default tag block
 * covers whether or not the tag matters. A property a service refuses fails
 * the Resource, so tagging is one of the places a mapping has to know what the
 * service will take.
 */
export function snsTopic(
  context: TerraformMappingContext,
): TerraformMappedResource {
  const fifo = attribute(context, "fifo_topic");

  return {
    Type: "AWS::SNS::Topic",
    Properties: {
      ...renamed(context, { TopicName: "name", DisplayName: "display_name" }),
      ...(fifo === true && { FifoTopic: true }),
    },
    lost: tags(context) === undefined ? [] : ["tags"],
  };
}

/** A subscription, which Terraform declares apart from its topic as well. */
export function snsSubscription(
  context: TerraformMappingContext,
): TerraformMappedResource {
  return {
    Type: "AWS::SNS::Subscription",
    Properties: renamed(context, {
      TopicArn: "topic_arn",
      Protocol: "protocol",
      Endpoint: "endpoint",
      RawMessageDelivery: "raw_message_delivery",
    }),
  };
}
