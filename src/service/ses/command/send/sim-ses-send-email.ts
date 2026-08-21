import { randomUUID } from "node:crypto";

import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  requiredSimSesFromAddress,
  simSesBareAddress,
} from "../../email/sim-ses-address.js";
import { SimSesSentEmail } from "../../email/sim-ses-sent-email.js";
import type { SimSesSentEmailDestination } from "../../email/sim-ses-sent-email.js";
import type { SimSesSentEmailStore } from "../../email/sim-ses-sent-email-store.js";
import { SimSesBadRequestException } from "../../error/sim-ses.error.js";
import type { SimSesIdentityStore } from "../../identity/sim-ses-identity-store.js";
import type { SimSesAuthorizer } from "../authorize/sim-ses-authorizer.js";
import type { SimSesRequestOptions } from "../sim-ses-request-options.js";
import type {
  SimSendEmailCommand,
  SimSendEmailCommandOutput,
  SimSesDestination,
} from "./send.command.js";
import type { SimSesContentReader } from "./sim-ses-content.js";
import type { SimSesSuppressionCheck } from "./sim-ses-suppression-check.js";
import { refuseUnsimulatedSendInput } from "./sim-ses-unsimulated-send-input.js";
import type { SimSesVerifiedIdentityCheck } from "./sim-ses-verified-identities.js";

interface SimSesSendEmailProperties {
  readonly identities: SimSesIdentityStore;
  readonly content: SimSesContentReader;
  readonly sent: SimSesSentEmailStore;
  readonly identityCheck: SimSesVerifiedIdentityCheck;
  readonly suppressionCheck: SimSesSuppressionCheck;
  readonly authorizer: SimSesAuthorizer;
  readonly clock: SimClock;
}

/**
 * The SendEmail command.
 *
 * Nothing is delivered, so what this does is decide whether SES would have
 * accepted the message and, if it would, keep what it would have sent. The
 * order matters and follows real SES: IAM decides the request before the
 * service looks at it, then the identity check, then the message is recorded.
 * A caller with no permission is therefore refused whether or not its
 * identities are verified.
 *
 * The suppression list refuses nothing. SES accepts a message addressed to a
 * suppressed recipient and holds it back from that recipient, so the check
 * runs last and its answer goes on the record.
 */
export class SimSesSendEmail {
  readonly #identities: SimSesIdentityStore;
  readonly #content: SimSesContentReader;
  readonly #sent: SimSesSentEmailStore;
  readonly #identityCheck: SimSesVerifiedIdentityCheck;
  readonly #suppressionCheck: SimSesSuppressionCheck;
  readonly #authorizer: SimSesAuthorizer;
  readonly #clock: SimClock;

  constructor(properties: SimSesSendEmailProperties) {
    this.#identities = properties.identities;
    this.#content = properties.content;
    this.#sent = properties.sent;
    this.#identityCheck = properties.identityCheck;
    this.#suppressionCheck = properties.suppressionCheck;
    this.#authorizer = properties.authorizer;
    this.#clock = properties.clock;
  }

  /**
   * Accept a message, or refuse it the way SES would.
   */
  handle(
    command: SimSendEmailCommand,
    options?: SimSesRequestOptions,
  ): SimSendEmailCommandOutput {
    const input = command.input;
    const fromEmailAddress = requiredSimSesFromAddress(input.FromEmailAddress);

    refuseUnsimulatedSendInput(input);

    this.#authorizer.authorizeIdentity(
      "ses:SendEmail",
      this.#identities.covering(simSesBareAddress(fromEmailAddress)),
      options?.caller,
    );

    const destination = readDestination(input.Destination);
    const recipients = allRecipients(destination);

    if (recipients.length === 0) {
      throw new SimSesBadRequestException(
        "1 validation error detected: Value at 'destination' failed to " +
          "satisfy constraint: Member must have at least one recipient",
      );
    }

    const content = this.#content.read(input.Content);

    this.#identityCheck.check({ fromEmailAddress, recipients });

    const messageId = randomUUID();

    this.#sent.add(
      new SimSesSentEmail({
        messageId,
        fromEmailAddress,
        destination,
        replyToAddresses: [...(input.ReplyToAddresses ?? [])],
        subject: content.subject,
        body: content.body,
        templateName: content.templateName,
        templateData: content.templateData,
        configurationSetName: input.ConfigurationSetName,
        suppressedRecipients: this.#suppressionCheck.withheldFrom(recipients),
        sentDate: this.#clock.now(),
      }),
    );

    return { $metadata: {}, MessageId: messageId };
  }
}

/**
 * Who the message is addressed to, with the three lists kept apart.
 */
function readDestination(
  destination: SimSesDestination | undefined,
): SimSesSentEmailDestination {
  return {
    toAddresses: [...(destination?.ToAddresses ?? [])],
    ccAddresses: [...(destination?.CcAddresses ?? [])],
    bccAddresses: [...(destination?.BccAddresses ?? [])],
  };
}

function allRecipients(
  destination: SimSesSentEmailDestination,
): readonly string[] {
  return [
    ...destination.toAddresses,
    ...destination.ccAddresses,
    ...destination.bccAddresses,
  ];
}
