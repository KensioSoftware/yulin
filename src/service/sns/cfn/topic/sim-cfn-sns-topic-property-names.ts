/**
 * The name the template gives the topic.
 */
export const topicNamePropertyName = "TopicName";

/**
 * The subscriptions declared inside the topic rather than as Resources of their
 * own.
 */
export const topicSubscriptionPropertyName = "Subscription";

/**
 * The AWS::SNS::Topic properties carrying a topic attribute of the same name.
 *
 * CloudFormation names these exactly as the SNS API names the attributes, so
 * they are handed to CreateTopic rather than read here. Simulated SNS takes
 * `DisplayName` and refuses the rest by name with the reason each one is
 * missing, which is the same refusal an SDK caller setting the attribute gets.
 * Keeping that decision in one place is what stops a template quietly accepting
 * something the SDK path would not.
 */
export const attributePropertyNames: ReadonlySet<string> = new Set([
  "ArchivePolicy",
  "ContentBasedDeduplication",
  "DisplayName",
  "FifoThroughputScope",
  "FifoTopic",
  "KmsMasterKeyId",
  "SignatureVersion",
  "TracingConfig",
]);

/**
 * The real AWS::SNS::Topic properties this simulation has no behaviour for and
 * no single topic attribute to hand them to.
 *
 * The rest of the unsimulated properties are attributes of the same name, so
 * SNS refuses those itself. These three are not: two are inputs of their own on
 * a CreateTopic request, and `DeliveryStatusLogging` is a list that would
 * become fifteen separate attributes.
 */
export const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "DataProtectionPolicy",
    "data protection policies are not simulated, so a topic deployed with one " +
      "would redact nothing while a test believed it was protecting the " +
      "messages going through the topic",
  ],
  [
    "DeliveryStatusLogging",
    "delivery status logging writes to CloudWatch Logs, which is not simulated",
  ],
  ["Tags", "no simulated service reads a topic tag"],
]);
