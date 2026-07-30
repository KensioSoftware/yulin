/**
 * The one settable attribute that is a JSON object rather than a number, so it
 * has no numeric range to be checked against.
 */
export const simSqsRedrivePolicyAttributeName = "RedrivePolicy";

/**
 * One queue attribute a request may set, and the range real SQS accepts for it.
 */
export interface SimSqsQueueAttributeSpec {
  readonly name: string;
  readonly defaultValue: number;
  readonly minimum: number;
  readonly maximum: number;
}

/**
 * The queue attributes simulated SQS holds, with the defaults and ranges real SQS
 * applies to them.
 */
export const simSqsSettableQueueAttributes: readonly SimSqsQueueAttributeSpec[] =
  [
    { name: "DelaySeconds", defaultValue: 0, minimum: 0, maximum: 900 },
    {
      name: "MaximumMessageSize",
      defaultValue: 262_144,
      minimum: 1024,
      maximum: 262_144,
    },
    {
      name: "MessageRetentionPeriod",
      defaultValue: 345_600,
      minimum: 60,
      maximum: 1_209_600,
    },
    {
      name: "ReceiveMessageWaitTimeSeconds",
      defaultValue: 0,
      minimum: 0,
      maximum: 20,
    },
    {
      name: "VisibilityTimeout",
      defaultValue: 30,
      minimum: 0,
      maximum: 43_200,
    },
  ];
