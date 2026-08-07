import {
  SimSnsInvalidParameterException,
  SimSnsUnsimulatedInputException,
} from "../error/sim-sns.error.js";

/**
 * The topic's display name, which is the only settable attribute with no
 * behaviour behind it.
 */
export const simSnsDisplayNameAttributeName = "DisplayName";

/**
 * The topic's resource policy, held as an attribute exactly as SNS holds it.
 */
export const simSnsPolicyAttributeName = "Policy";

const settableAttributeNames = new Set([
  simSnsDisplayNameAttributeName,
  simSnsPolicyAttributeName,
]);

/**
 * The delivery status logging attributes, one set per protocol.
 *
 * They are matched as a pattern rather than listed, because there are fifteen
 * of them and they are all refused for the same reason: delivery status goes to
 * CloudWatch Logs on real AWS, and nothing here writes to CloudWatch Logs.
 */
const deliveryStatusLoggingPattern =
  /^(?:HTTP|SQS|Lambda|Application|Firehose)(?:Success|Failure)Feedback(?:RoleArn|SampleRate)$/;

/**
 * The other attributes real SNS has that this simulation gives no behaviour to.
 *
 * Each is refused by name rather than being taken and ignored. A topic that
 * appeared to accept `KmsMasterKeyId` would look encrypted to the request that
 * set it and be plain to everything else, and a topic that appeared to accept
 * `FifoTopic` would be a standard topic a test believed was ordered.
 */
const unsimulatedAttributeNames = new Map<string, string>([
  ["FifoTopic", "FIFO topics are not simulated. Only standard topics are."],
  [
    "FifoThroughputScope",
    "FIFO topics are not simulated. Only standard topics are.",
  ],
  [
    "ContentBasedDeduplication",
    "Message deduplication applies to FIFO topics, which are not simulated.",
  ],
  ["KmsMasterKeyId", "Server-side encryption is not simulated."],
  [
    "SignatureVersion",
    "Choosing the message signature algorithm is not simulated.",
  ],
  ["TracingConfig", "X-Ray tracing is not simulated."],
  ["ArchivePolicy", "Message archiving and replay are not simulated."],
  ["DeliveryPolicy", "Delivery retry policies are not simulated."],
]);

/**
 * The reason an attribute real SNS has is refused here, if it is one of them.
 */
function unsimulatedReason(name: string): string | undefined {
  if (deliveryStatusLoggingPattern.test(name)) {
    return (
      "Delivery status logging writes to CloudWatch Logs, which is not " +
      "simulated."
    );
  }

  return unsimulatedAttributeNames.get(name);
}

/**
 * Refuse a topic attribute this simulation cannot set.
 *
 * An attribute real SNS has and this simulation does not is refused with the
 * reason, so a caller finds out what is missing rather than finding a topic
 * that quietly behaves differently here than on AWS. An attribute real SNS does
 * not have at all is refused the way real SNS refuses it.
 */
export function assertSimSnsSettableAttribute(name: string): void {
  if (settableAttributeNames.has(name)) {
    return;
  }

  const reason = unsimulatedReason(name);

  if (reason !== undefined) {
    throw new SimSnsUnsimulatedInputException(
      `The topic attribute ${name} is not simulated. ${reason}`,
    );
  }

  throw new SimSnsInvalidParameterException(
    `Invalid parameter: AttributeName: ${name} is not a topic attribute that ` +
      `can be set`,
  );
}
