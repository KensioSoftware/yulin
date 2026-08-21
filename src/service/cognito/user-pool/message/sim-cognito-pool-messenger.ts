import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAwsMessageLog } from "../../../aws/message/sim-aws-message-log.js";
import type { SimCognitoUserPoolClient } from "../client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import { SimCognitoTriggerOccasion } from "../trigger/sim-cognito-trigger-occasion.js";
import type { SimCognitoUserPoolTriggers } from "../trigger/sim-cognito-user-pool-triggers.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";
import { SimCognitoMessageDelivery } from "./sim-cognito-message-delivery.js";
import type { SimCognitoMessageOccasion } from "./sim-cognito-message-occasion.js";
import { SimCognitoMessagePlaceholders } from "./sim-cognito-message-placeholders.js";
import { simCognitoOccasionWording } from "./sim-cognito-occasion-wording.js";
import type { SimCognitoPoolEmailDelivery } from "./sim-cognito-pool-email-delivery.js";
import { SimCognitoSentMessage } from "./sim-cognito-sent-message.js";

interface SimCognitoPoolMessengerProperties {
  readonly triggers: SimCognitoUserPoolTriggers;

  /**
   * Where a message goes before it is recorded, which for a pool sending
   * through SES is the account's SES.
   */
  readonly email: SimCognitoPoolEmailDelivery;
  readonly clock: SimClock;
  readonly messageLog: SimAwsMessageLog;
}

/**
 * What a pool is about to send.
 */
interface SimCognitoMessageRequest {
  readonly pool: SimCognitoUserPool;
  readonly user: SimCognitoUser;
  readonly occasion: SimCognitoMessageOccasion;

  /**
   * The confirmation code or temporary password the message carries, where
   * the pool has one to put in it.
   */
  readonly code?: string | undefined;

  /** The app client the request came through, where one did. */
  readonly client?: SimCognitoUserPoolClient | undefined;
  readonly clientMetadata?: Readonly<Record<string, string>> | undefined;
}

/**
 * Records the messages a simulated user pool would have sent.
 *
 * Nothing is delivered. The pool keeps what it would have sent, and a test
 * reads it back off the pool, which is what makes a verification message
 * something a test can assert about at all.
 *
 * A pool sending its own email stops there. Real Cognito with the default
 * `EmailSendingAccount` of `COGNITO_DEFAULT` reaches no other service, so the
 * record is the whole of what happened.
 *
 * A pool whose `EmailConfiguration` named `DEVELOPER` sends through the
 * account's SES first, and records the message only once SES has taken it.
 * The record and `sesV2().sentEmails()` then agree with each other, and a
 * sign-up against a pool SES would refuse fails here as it would in a
 * deployment.
 */
export class SimCognitoPoolMessenger {
  private readonly triggers: SimCognitoUserPoolTriggers;
  private readonly email: SimCognitoPoolEmailDelivery;
  private readonly clock: SimClock;
  private readonly messageLog: SimAwsMessageLog;

  constructor(properties: SimCognitoPoolMessengerProperties) {
    this.triggers = properties.triggers;
    this.email = properties.email;
    this.clock = properties.clock;
    this.messageLog = properties.messageLog;
  }

  /**
   * Send the message this occasion produces, running the pool's
   * `CustomMessage` trigger first so that a handler can write its own.
   *
   * A pool with nowhere to write to sends nothing, as one does on real
   * Cognito, rather than recording a message addressed to no one. Where a
   * message did go out, the answer says where, because an operation reporting
   * `CodeDeliveryDetails` has nowhere else to read that from.
   */
  async send(
    request: SimCognitoMessageRequest,
  ): Promise<SimCognitoMessageDelivery | undefined> {
    const delivery = SimCognitoMessageDelivery.forOccasion(
      request.pool,
      request.user,
      request.occasion,
    );

    if (delivery === undefined) {
      return undefined;
    }

    const { medium } = delivery;
    const custom = await this.triggers.customMessage(
      SimCognitoTriggerOccasion.customMessage(request.occasion),
      {
        pool: request.pool,
        user: request.user,
        client: request.client,
        clientMetadata: request.clientMetadata,
      },
    );
    const pooled = simCognitoOccasionWording(
      request.pool,
      request.occasion,
      medium,
    );
    // The code and the username go in last, so that what a handler wrote
    // carries them too.
    const placeholders = new SimCognitoMessagePlaceholders({
      username: request.user.username,
      code: request.code,
    });
    const wording = custom.wordingFor(medium, pooled).filledWith(placeholders);

    this.email.send({ pool: request.pool, delivery, wording });

    const message = new SimCognitoSentMessage({
      username: request.user.username,
      recipient: delivery.recipient,
      medium,
      wording,
      occasion: request.occasion,
      sentDate: this.clock.now(),
    });

    request.pool.messages.record(message);
    // Announced after it is recorded, so a listener that goes and reads the
    // pool finds the message it was just told about.
    this.messageLog.record({
      kind: "cognito",
      userPoolId: request.pool.id,
      medium,
      recipient: message.recipient,
      occasion: message.occasion,
      subject: message.subject,
      body: message.body,
    });

    return delivery;
  }
}
