import { simAwsLineage } from "../../../aws/lineage/sim-aws-lineage.js";
import { SimSqsUnsupportedOperation } from "../../error/sim-sqs.error.js";
import type { SimSqsMessage } from "../../message/sim-sqs-message.js";
import { SimSqsMessageAttributes } from "../../message/sim-sqs-message-attributes.js";
import type { SimSqsMessageWrite } from "../../message/sim-sqs-message-writer.js";
import type { SimSqsSentMessage } from "./send.command.js";

/**
 * Read the message a send request describes, refusing the fields this simulation
 * does not model.
 *
 * The FIFO fields are refused because there are no FIFO queues here to give them
 * meaning, and a message accepted with a `MessageGroupId` that ordered nothing
 * would be a message a test believed was ordered.
 */
export function sentMessageWrite(sent: SimSqsSentMessage): SimSqsMessageWrite {
  if (
    sent.MessageDeduplicationId !== undefined ||
    sent.MessageGroupId !== undefined
  ) {
    throw new SimSqsUnsupportedOperation(
      "MessageDeduplicationId and MessageGroupId apply to FIFO queues, which " +
        "simulated SQS does not support",
    );
  }

  return {
    body: sent.MessageBody,
    attributes: SimSqsMessageAttributes.of(sent.MessageAttributes),
    delaySeconds: sent.DelaySeconds,
    traceHeader: sentTraceHeader(sent) ?? simAwsLineage.traceHeader(),
  };
}

/**
 * The digest of a message's attributes, which SQS reports only when there are
 * some.
 */
export function sentMessageAttributesDigest(
  message: SimSqsMessage,
): string | undefined {
  if (message.attributes.isEmpty) {
    return undefined;
  }

  return message.attributes.digest();
}

/**
 * The X-Ray trace header a send request carries, which is the one message
 * system attribute real SQS accepts on a send.
 *
 * A message sent with none from inside a Lambda invocation gets the one the
 * invocation's SDK would add, carrying the chain of requests it is part of.
 */
function sentTraceHeader(sent: SimSqsSentMessage): string | undefined {
  const attributes = sent.MessageSystemAttributes;

  if (attributes === undefined) {
    return undefined;
  }

  const names = Object.keys(attributes);
  const header = attributes["AWSTraceHeader"];

  if (header === undefined || names.some((name) => name !== "AWSTraceHeader")) {
    throw new SimSqsUnsupportedOperation(
      "AWSTraceHeader is the only message system attribute a message can be " +
        "sent with",
    );
  }

  return header.StringValue;
}
