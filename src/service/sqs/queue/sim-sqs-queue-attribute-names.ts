import {
  SimSqsInvalidAttributeName,
  SimSqsUnsupportedOperation,
} from "../error/sim-sqs.error.js";
import {
  type SimSqsQueueAttributeSpec,
  simSqsSettableQueueAttributes,
} from "./sim-sqs-queue-attribute-specs.js";

/**
 * The attributes SQS reports and no request sets, because the queue itself
 * decides them.
 */
const readOnlyNames: ReadonlySet<string> = new Set([
  "ApproximateNumberOfMessages",
  "ApproximateNumberOfMessagesDelayed",
  "ApproximateNumberOfMessagesNotVisible",
  "CreatedTimestamp",
  "LastModifiedTimestamp",
  "QueueArn",
]);

/**
 * Real SQS attributes this simulation does not model. A request setting one is
 * refused rather than quietly ignored, since a queue behaving as though it had
 * a redrive policy it does not have is worse than being told it cannot have one.
 */
const unsimulatedNames: ReadonlySet<string> = new Set([
  "ContentBasedDeduplication",
  "DeduplicationScope",
  "FifoQueue",
  "FifoThroughputLimit",
  "KmsDataKeyReusePeriodSeconds",
  "KmsMasterKeyId",
  "Policy",
  "RedriveAllowPolicy",
  "RedrivePolicy",
  "SqsManagedSseEnabled",
]);

const knownNames = new Set<string>([
  ...simSqsSettableQueueAttributes.map((spec) => spec.name),
  ...readOnlyNames,
  ...unsimulatedNames,
]);

const settableSpecsByName = new Map<string, SimSqsQueueAttributeSpec>(
  simSqsSettableQueueAttributes.map((spec) => [spec.name, spec]),
);

/**
 * The queue attribute names, and what each of them may be used for.
 *
 * Reading and setting are separate questions. Real SQS leaves an attribute out
 * of a GetQueueAttributes response when the queue has no value for it, so
 * asking for an attribute this simulation does not model is answered with
 * silence rather than a failure. Setting one is refused, because a request that
 * appeared to succeed would leave the queue behaving differently here than on
 * AWS.
 */
export const SimSqsQueueAttributeNames = {
  /**
   * The attributes a CreateQueue or SetQueueAttributes request may set.
   */
  get settable(): readonly SimSqsQueueAttributeSpec[] {
    return simSqsSettableQueueAttributes;
  },

  /**
   * Ensure an attribute name is one real SQS reports.
   */
  assertReadable(name: string): void {
    if (name === "All" || knownNames.has(name)) {
      return;
    }

    throw new SimSqsInvalidAttributeName(
      `Unknown Attribute ${name}: it is not an SQS queue attribute name`,
    );
  },

  /**
   * Get the spec for an attribute a request is setting, refusing one that
   * cannot be set.
   */
  specForSetting(name: string): SimSqsQueueAttributeSpec {
    const spec = settableSpecsByName.get(name);

    if (spec !== undefined) {
      return spec;
    }

    if (unsimulatedNames.has(name)) {
      throw new SimSqsUnsupportedOperation(
        `Queue attribute ${name} is a real SQS attribute that simulated SQS ` +
          `does not simulate, so setting it is refused rather than ignored`,
      );
    }

    if (readOnlyNames.has(name)) {
      throw new SimSqsInvalidAttributeName(
        `Unknown Attribute ${name}: it is reported by SQS rather than set`,
      );
    }

    throw new SimSqsInvalidAttributeName(
      `Unknown Attribute ${name}: it is not an SQS queue attribute name`,
    );
  },
};
