/**
 * The attribute naming the dead-letter queue a message goes to once a consumer
 * has had enough attempts at it.
 */
export const simSqsRedrivePolicyAttributeName = "RedrivePolicy";

/**
 * The attribute holding the queue's resource policy.
 */
export const simSqsQueuePolicyAttributeName = "Policy";

/**
 * The settable attributes that are JSON documents rather than numbers, so they
 * have no numeric range to be checked against.
 *
 * Both are held apart from the numeric attributes, and both are read back as
 * the string they were set with rather than as a re-serialised version of it.
 */
export const simSqsJsonQueueAttributeNames: ReadonlySet<string> = new Set([
  simSqsRedrivePolicyAttributeName,
  simSqsQueuePolicyAttributeName,
]);

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
