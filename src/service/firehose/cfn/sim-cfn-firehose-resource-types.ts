/**
 * The CloudFormation Resource types simulated Firehose creates.
 *
 * Named here rather than spelled out where they are used, because each one is
 * written twice: once by the factory dispatching on it, and once by the
 * refusals that quote it back to whoever wrote the template.
 */
export const firehoseDeliveryStreamResourceType =
  "AWS::KinesisFirehose::DeliveryStream";

/**
 * The Resource type name the factory dispatches on, which is the last part of
 * the full type.
 */
export const firehoseDeliveryStreamResourceTypeName = "DeliveryStream";
