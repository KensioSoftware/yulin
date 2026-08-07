import { randomUUID } from "node:crypto";
import { SimSnsInvalidParameterException } from "../error/sim-sns.error.js";
import type { SimSnsMessageAttributes } from "./sim-sns-message-attributes.js";
import { SimSnsMessageBody } from "./sim-sns-message-body.js";
import { SimSnsMessageSubject } from "./sim-sns-message-subject.js";

/**
 * The largest a published message may be, counting its attributes.
 *
 * Real SNS states the limit as 256 KB for a publish and counts the message
 * attributes against it alongside the body, so both are added up here. The
 * exact accounting AWS uses for an attribute is not documented, so this counts
 * the bytes of each attribute's name, data type and value.
 */
export const simSnsMaximumPublishBytes = 262_144;

/**
 * Refuse a publish weighing more than one message is allowed to.
 *
 * A publish of its own is held to the limit here. A batch is held to the same
 * limit over the whole batch rather than over each entry, so it does its own
 * checking and reports its own error.
 */
export function assertSimSnsMessageWithinLimit(byteSize: number): void {
  if (byteSize > simSnsMaximumPublishBytes) {
    throw new SimSnsInvalidParameterException(
      `Invalid parameter: Message too long. A message and its attributes may ` +
        `be up to ${String(simSnsMaximumPublishBytes)} bytes, and this one ` +
        `is ${String(byteSize)} bytes.`,
    );
  }
}

/**
 * One message as a publisher describes it, with the request's own wrapping
 * removed.
 */
export interface SimSnsPublishedMessageInput {
  readonly message: string | undefined;
  readonly subject: string | undefined;
  readonly attributes: SimSnsMessageAttributes;
}

interface SimSnsPublishedMessageProperties {
  readonly messageId: string;
  readonly body: SimSnsMessageBody;
  readonly subject: SimSnsMessageSubject | undefined;
  readonly attributes: SimSnsMessageAttributes;
  readonly publishedAt: Date;
}

/**
 * One message a publish put on a topic.
 *
 * A topic keeps no messages, so nothing holds this after the publish that made
 * it. It exists so that everything a message has to be checked for happens in
 * one place, whether the publish was one of its own or one entry of a batch.
 * The size limit is the one thing left to the caller, because a batch is held
 * to it over the whole batch rather than over each entry.
 */
export class SimSnsPublishedMessage {
  public readonly messageId: string;
  public readonly body: SimSnsMessageBody;
  public readonly subject: SimSnsMessageSubject | undefined;
  public readonly attributes: SimSnsMessageAttributes;
  public readonly publishedAt: Date;

  private constructor(properties: SimSnsPublishedMessageProperties) {
    this.messageId = properties.messageId;
    this.body = properties.body;
    this.subject = properties.subject;
    this.attributes = properties.attributes;
    this.publishedAt = properties.publishedAt;
  }

  /**
   * Read the message a publish describes, refusing one real SNS would refuse.
   */
  static of(
    input: SimSnsPublishedMessageInput,
    publishedAt: Date,
  ): SimSnsPublishedMessage {
    return new this({
      messageId: randomUUID(),
      body: SimSnsMessageBody.of(input.message),
      subject: SimSnsMessageSubject.optional(input.subject),
      attributes: input.attributes,
      publishedAt,
    });
  }

  /**
   * What this message weighs against the publish size limit.
   */
  get byteSize(): number {
    return this.body.byteSize + this.attributes.byteSize;
  }
}
