import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimSesAccount } from "../account/sim-ses-account.js";
import type { SimSesConfigurationSetStore } from "../configuration-set/sim-ses-configuration-set-store.js";
import { simSesBareAddress } from "../email/sim-ses-address.js";
import type { SimSesSentEmail } from "../email/sim-ses-sent-email.js";
import type { SimSesSentEmailStore } from "../email/sim-ses-sent-email-store.js";
import { SimSesFeedbackError } from "../error/sim-ses.error.js";
import { requiredSimSesSuppressionAddress } from "../suppression/sim-ses-suppression-address.js";
import type { SimSesSuppressionList } from "../suppression/sim-ses-suppression-list.js";
import {
  requiredSimSesSuppressionReason,
  type SimSesSuppressionReason,
} from "../suppression/sim-ses-suppression-reason.js";
import type { SimSesSuppressedDestination } from "../suppression/sim-ses-suppressed-destination.js";

/** A hard bounce or complaint reported for one accepted message recipient. */
export interface SimSesFeedback {
  readonly messageId: string;
  readonly emailAddress: string;
  readonly reason: SimSesSuppressionReason;
}

interface SimSesFeedbackRecorderProperties {
  readonly sent: SimSesSentEmailStore;
  readonly configurationSets: SimSesConfigurationSetStore;
  readonly account: SimSesAccount;
  readonly suppression: SimSesSuppressionList;
  readonly clock: SimClock;
}

/** Applies explicit delivery feedback to the account suppression list. */
export class SimSesFeedbackRecorder {
  readonly #sent: SimSesSentEmailStore;
  readonly #configurationSets: SimSesConfigurationSetStore;
  readonly #account: SimSesAccount;
  readonly #suppression: SimSesSuppressionList;
  readonly #clock: SimClock;

  constructor(properties: SimSesFeedbackRecorderProperties) {
    this.#sent = properties.sent;
    this.#configurationSets = properties.configurationSets;
    this.#account = properties.account;
    this.#suppression = properties.suppression;
    this.#clock = properties.clock;
  }

  /**
   * Record a hard bounce or complaint for one recipient of an accepted
   * message.
   *
   * The returned entry is undefined when suppression for the feedback reason
   * was inactive for this send.
   */
  record(feedback: SimSesFeedback): SimSesSuppressedDestination | undefined {
    const email = this.#sent.require(feedback.messageId);
    const emailAddress = requiredSimSesSuppressionAddress(
      feedback.emailAddress,
    );
    const reason = requiredSimSesSuppressionReason(feedback.reason);
    const recipient = this.#recipient(email, emailAddress);

    if (!this.#isActive(email, reason)) {
      return undefined;
    }

    return this.#suppression.put(recipient, reason, this.#clock.now());
  }

  #recipient(email: SimSesSentEmail, emailAddress: string): string {
    const wanted = emailAddress.toLowerCase();
    const recipient = email.recipients
      .map((address) => simSesBareAddress(address))
      .find((address) => address.toLowerCase() === wanted);

    if (recipient === undefined) {
      throw new SimSesFeedbackError(
        `${emailAddress} is not a recipient of sim SES message ${email.messageId}.`,
      );
    }

    return recipient;
  }

  #isActive(email: SimSesSentEmail, reason: SimSesSuppressionReason): boolean {
    if (email.configurationSetName !== undefined) {
      const configurationSet = this.#configurationSets.find(
        email.configurationSetName,
      );

      if (configurationSet?.suppressedReasons !== undefined) {
        return configurationSet.suppressedReasons.includes(reason);
      }
    }

    return this.#account.isSuppressedFor(reason);
  }
}
