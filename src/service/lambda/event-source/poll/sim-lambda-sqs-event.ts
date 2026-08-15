import type {
  SimSqsPollMessage,
  SimSqsPollMessageAttribute,
} from "../../../sqs/poll/sim-sqs-poll-message.js";
import type { SimLambdaSqsEventSourceArn } from "../queue/sim-lambda-sqs-event-source-arn.js";

/**
 * One message attribute as an SQS event record carries it.
 *
 * The list values are always there and always empty, as they are on real AWS:
 * SQS accepts the list data types in a request and reports nothing for them.
 */
export interface SimLambdaSqsEventMessageAttribute {
  readonly stringValue?: string | undefined;
  readonly binaryValue?: string | undefined;
  readonly stringListValues: readonly string[];
  readonly binaryListValues: readonly string[];
  readonly dataType: string;
}

/**
 * One message as an SQS event record.
 *
 * https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
 */
export interface SimLambdaSqsEventRecord {
  readonly messageId: string;
  readonly receiptHandle: string;
  readonly body: string;
  readonly attributes: Record<string, string>;
  readonly messageAttributes: Record<string, SimLambdaSqsEventMessageAttribute>;
  readonly md5OfBody: string;
  readonly eventSource: "aws:sqs";
  readonly eventSourceARN: string;
  readonly awsRegion: string;
}

/**
 * The event an SQS event source mapping invokes a function with.
 */
export interface SimLambdaSqsEvent {
  readonly Records: readonly SimLambdaSqsEventRecord[];
}

/**
 * Builds the SQS event for one batch of polled messages.
 *
 * The event is what the function code sees, so it is built in the event's own
 * naming rather than the queue's: lower-case record fields, the message system
 * attributes flattened into `attributes`, and binary attribute values base64
 * encoded as they cross into JSON.
 */
export class SimLambdaSqsEventBuilder {
  private readonly eventSourceArn: SimLambdaSqsEventSourceArn;

  constructor(eventSourceArn: SimLambdaSqsEventSourceArn) {
    this.eventSourceArn = eventSourceArn;
  }

  /**
   * The event for a batch of messages.
   */
  of(messages: readonly SimSqsPollMessage[]): SimLambdaSqsEvent {
    return { Records: messages.map((message) => this.record(message)) };
  }

  private record(message: SimSqsPollMessage): SimLambdaSqsEventRecord {
    return {
      messageId: message.MessageId,
      receiptHandle: message.ReceiptHandle,
      body: message.Body,
      attributes: { ...message.Attributes },
      messageAttributes: this.messageAttributes(message),
      md5OfBody: message.MD5OfBody,
      eventSource: "aws:sqs",
      eventSourceARN: this.eventSourceArn.value,
      awsRegion: this.eventSourceArn.regionName,
    };
  }

  private messageAttributes(
    message: SimSqsPollMessage,
  ): Record<string, SimLambdaSqsEventMessageAttribute> {
    return Object.fromEntries(
      Object.entries(message.MessageAttributes ?? {}).map(([name, value]) => [
        name,
        eventMessageAttribute(value),
      ]),
    );
  }
}

function eventMessageAttribute(
  attribute: SimSqsPollMessageAttribute,
): SimLambdaSqsEventMessageAttribute {
  return {
    stringValue: attribute.StringValue,
    binaryValue: base64Of(attribute.BinaryValue),
    stringListValues: [],
    binaryListValues: [],
    dataType: attribute.DataType ?? "String",
  };
}

function base64Of(value: Uint8Array | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Buffer.from(value).toString("base64");
}
