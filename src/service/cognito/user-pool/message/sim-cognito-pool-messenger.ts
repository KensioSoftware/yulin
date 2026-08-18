import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimCognitoUserPoolClient } from "../client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import { SimCognitoTriggerOccasion } from "../trigger/sim-cognito-trigger-occasion.js";
import type { SimCognitoUserPoolTriggers } from "../trigger/sim-cognito-user-pool-triggers.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";
import { SimCognitoMessageDelivery } from "./sim-cognito-message-delivery.js";
import type { SimCognitoMessageOccasion } from "./sim-cognito-message-occasion.js";
import { SimCognitoMessagePlaceholders } from "./sim-cognito-message-placeholders.js";
import { simCognitoOccasionWording } from "./sim-cognito-occasion-wording.js";
import { SimCognitoSentMessage } from "./sim-cognito-sent-message.js";

interface SimCognitoPoolMessengerProperties {
  readonly triggers: SimCognitoUserPoolTriggers;
  readonly clock: SimClock;
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
 * This is Cognito's own delivery, not SES. Real Cognito with the default
 * `EmailSendingAccount` of `COGNITO_DEFAULT` sends through no other service,
 * and `EmailConfiguration` is refused here, so no pool is configured for one
 * that would.
 */
export class SimCognitoPoolMessenger {
  private readonly triggers: SimCognitoUserPoolTriggers;
  private readonly clock: SimClock;

  constructor(properties: SimCognitoPoolMessengerProperties) {
    this.triggers = properties.triggers;
    this.clock = properties.clock;
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
    const wording = custom.wordingFor(medium, pooled);

    request.pool.messages.record(
      new SimCognitoSentMessage({
        username: request.user.username,
        recipient: delivery.recipient,
        medium,
        wording: wording.filledWith(placeholders),
        occasion: request.occasion,
        sentDate: this.clock.now(),
      }),
    );

    return delivery;
  }
}
