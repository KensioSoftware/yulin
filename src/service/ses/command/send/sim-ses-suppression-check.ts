import type { SimSesAccount } from "../../account/sim-ses-account.js";
import { simSesBareAddress } from "../../email/sim-ses-address.js";
import type { SimSesSuppressedRecipient } from "../../email/sim-ses-sent-email.js";
import type { SimSesSuppressionList } from "../../suppression/sim-ses-suppression-list.js";

interface SimSesSuppressionCheckProperties {
  readonly suppression: SimSesSuppressionList;
  readonly account: SimSesAccount;
}

/**
 * Which of a message's recipients the suppression list holds back.
 *
 * SES accepts a message addressed to a suppressed recipient and does not
 * deliver it, and it counts toward the daily sending quota either way. So this
 * refuses nothing. It reports what was held back, and the recorded send keeps
 * the answer.
 *
 * A recipient is held back when it is on the list and the account is
 * suppressing for the reason it was listed under. The two have to match, which
 * is the part of the rules most easily got wrong: an address listed for
 * `COMPLAINT` under an account suppressing only `BOUNCE` is mailed.
 */
export class SimSesSuppressionCheck {
  readonly #suppression: SimSesSuppressionList;
  readonly #account: SimSesAccount;

  constructor(properties: SimSesSuppressionCheckProperties) {
    this.#suppression = properties.suppression;
    this.#account = properties.account;
  }

  /**
   * The recipients of one message SES would hold back, in the order the
   * message addressed them.
   */
  withheldFrom(
    recipients: readonly string[],
  ): readonly SimSesSuppressedRecipient[] {
    return recipients.flatMap((recipient) => {
      const suppressed = this.#suppression.matching(
        simSesBareAddress(recipient),
      );

      if (
        suppressed === undefined ||
        !this.#account.isSuppressedFor(suppressed.reason)
      ) {
        return [];
      }

      return [{ emailAddress: recipient, reason: suppressed.reason }];
    });
  }
}
