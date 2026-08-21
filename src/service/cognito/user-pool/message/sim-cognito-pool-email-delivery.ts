import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimCognitoCodeDeliveryFailureException,
  SimCognitoInvalidEmailRoleAccessPolicyException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import type {
  SimCognitoEmailSendFailure,
  SimCognitoEmailSenders,
} from "./sim-cognito-email-senders.js";
import type { SimCognitoMessageDelivery } from "./sim-cognito-message-delivery.js";
import type { SimCognitoMessageWording } from "./sim-cognito-message-wording.js";

interface SimCognitoPoolEmailDeliveryProperties {
  readonly senders: SimCognitoEmailSenders;
}

/**
 * What a pool is about to email, once the wording is settled.
 */
interface SimCognitoPoolEmail {
  readonly pool: SimCognitoUserPool;

  /** Where the message is going, and by which medium. */
  readonly delivery: SimCognitoMessageDelivery;
  readonly wording: SimCognitoMessageWording;
}

/**
 * Sends a pool's email through the account's SES, where the pool asked for
 * that.
 *
 * A pool sending through Cognito's own email passes through here untouched.
 * There is nowhere for such a message to go: real Cognito's built-in sending
 * reaches no other AWS service, so the record the pool keeps is the whole of
 * it.
 */
export class SimCognitoPoolEmailDelivery {
  readonly #senders: SimCognitoEmailSenders;

  constructor(properties: SimCognitoPoolEmailDeliveryProperties) {
    this.#senders = properties.senders;
  }

  /**
   * Put the message through SES, or do nothing where it is a text message or
   * the pool sends its own email.
   *
   * This runs before the pool records the message, so a send SES refuses
   * leaves the pool without one. The two records then agree: a message the
   * pool kept is a message SES accepted, which is what makes reading either of
   * them worth anything.
   */
  send(email: SimCognitoPoolEmail): void {
    const configuration = email.pool.settings.emailConfiguration;

    if (
      email.delivery.medium !== "EMAIL" ||
      configuration.sourceIdentity === undefined
    ) {
      return;
    }

    // Every wording an email is written from carries a subject, whether the
    // pool's own or one a CustomMessage handler wrote. Only a text message
    // goes without, and one never reaches here.
    assertDefined(
      email.wording.subject,
      "A pool's email wording has a subject",
    );

    const failure = this.#senders.send({
      identity: configuration.sourceIdentity,
      accountId: email.pool.arn.accountId,
      from: configuration.from,
      replyToAddresses:
        configuration.replyToEmailAddress === undefined
          ? []
          : [configuration.replyToEmailAddress],
      configurationSet: configuration.configurationSet,
      recipient: email.delivery.recipient,
      subject: email.wording.subject,
      body: email.wording.body,
    });

    if (failure !== undefined) {
      throw failureException(failure, email.pool);
    }
  }
}

/**
 * The exception real Cognito raises for this failure.
 *
 * A pool that cannot use its identity and a message SES would not take are two
 * different problems for whoever has to fix the deployment, and real Cognito
 * keeps them apart, so the sign-up that hit one says which.
 */
function failureException(
  failure: SimCognitoEmailSendFailure,
  pool: SimCognitoUserPool,
): Error {
  const message = `${pool.id} could not send through SES: ${failure.reason}`;

  return failure.kind === "identity"
    ? new SimCognitoInvalidEmailRoleAccessPolicyException(message)
    : new SimCognitoCodeDeliveryFailureException(message);
}
