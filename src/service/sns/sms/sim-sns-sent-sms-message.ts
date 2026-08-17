import type { SimSnsMessageAttributes } from "../message/sim-sns-message-attributes.js";
import {
  simSnsSenderIdAttribute,
  simSnsSmsTypeAttribute,
} from "../message/sim-sns-sms-attributes.js";

interface SimSnsSentSmsMessageProperties {
  readonly messageId: string;
  readonly phoneNumber: string;
  readonly message: string;
  readonly attributes: SimSnsMessageAttributes;
  readonly suppressed: boolean;
  readonly sentDate: Date;
  readonly topicArn?: string;
  readonly subscriptionArn?: string;
}

/**
 * One SMS a simulated SNS would have sent.
 *
 * Delivery stops at the simulator boundary, and this record is the whole of
 * what an SMS is here. Simulated SNS keeps it itself, the way a simulated
 * Cognito user pool keeps the verification and MFA messages it would have
 * texted.
 *
 * There is no subject. Real SNS uses `Subject` for email and leaves it off an
 * SMS. A publish that carries one to a phone number has it ignored.
 */
export class SimSnsSentSmsMessage {
  public readonly messageId: string;

  /** The E.164 number this would have gone to. */
  public readonly phoneNumber: string;

  /** The body, which arrives on a handset as the whole of the message. */
  public readonly message: string;

  /**
   * The message attributes the publish carried, including the `AWS.SNS.SMS.`
   * ones real SNS reads for the sender id, the message type and the price cap.
   */
  public readonly attributes: SimSnsMessageAttributes;

  /**
   * Whether the opt-out list stopped this one.
   *
   * A publish to an opted-out number succeeds and answers with a message id,
   * and nothing arrives. The record is kept either way, and this flag tells
   * the two apart. A test about a code reaching a handset asserts on a
   * delivered message, and a test about the opt-out list has something to
   * read.
   */
  public readonly suppressed: boolean;

  public readonly sentDate: Date;

  /**
   * The topic that fanned this one out, where a topic did.
   *
   * A publish naming a phone number reaches no topic, so both this and the
   * subscription ARN are absent for one. A test asserting on the SMS a topic
   * sent has them to assert on.
   */
  public readonly topicArn: string | undefined;

  /** The `sms` subscription that took this message, where one did. */
  public readonly subscriptionArn: string | undefined;

  constructor(properties: SimSnsSentSmsMessageProperties) {
    this.messageId = properties.messageId;
    this.phoneNumber = properties.phoneNumber;
    this.message = properties.message;
    this.attributes = properties.attributes;
    this.suppressed = properties.suppressed;
    this.sentDate = properties.sentDate;
    this.topicArn = properties.topicArn;
    this.subscriptionArn = properties.subscriptionArn;
  }

  /**
   * The name this SMS appears to come from, where the publish set one.
   */
  get senderId(): string | undefined {
    return this.attributes.find(simSnsSenderIdAttribute)?.envelopeValue;
  }

  /**
   * `Transactional` or `Promotional`, where the publish set one.
   *
   * Real SNS reads this to decide how it routes and prices a message. Routing
   * and pricing are absent here, and the value is recorded and left alone.
   */
  get smsType(): string | undefined {
    return this.attributes.find(simSnsSmsTypeAttribute)?.envelopeValue;
  }
}
