import { randomUUID } from "node:crypto";

import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { simSesBareAddress } from "../../email/sim-ses-address.js";
import { SimSesSentEmail } from "../../email/sim-ses-sent-email.js";
import type { SimSesSentEmailStore } from "../../email/sim-ses-sent-email-store.js";
import type { SimSesVerifiedIdentityCheck } from "./sim-ses-verified-identities.js";

/**
 * A message another simulated service is sending through SES on an account's
 * behalf.
 *
 * One recipient, and a plain text body. That is the whole of what a service
 * sender needs so far: a Cognito user pool writes one message to one user at a
 * time, and writes it as text.
 */
export interface SimSesServiceSendRequest {
  readonly fromEmailAddress: string;
  readonly toAddress: string;
  readonly replyToAddresses: readonly string[];
  readonly subject: string;
  readonly body: string;
  readonly configurationSetName: string | undefined;
}

/**
 * What SES made of the message: the id it would have answered with, or why it
 * would have turned the message down.
 *
 * A refusal comes back rather than being thrown. The service that asked
 * reports it in its own vocabulary, and an SES exception crossing the boundary
 * would leave that service repackaging one error as another.
 */
export interface SimSesServiceSendResult {
  readonly messageId?: string | undefined;
  readonly refusedBecause?: string | undefined;
}

interface SimSesServiceSendProperties {
  readonly sent: SimSesSentEmailStore;
  readonly identityCheck: SimSesVerifiedIdentityCheck;
  readonly clock: SimClock;
}

/**
 * A send that reaches SES from another simulated service rather than from a
 * caller with an SDK client.
 *
 * The identity check and the recorded message are the same as `SendEmail`.
 * IAM is the difference, and it is left out on purpose: a Cognito user pool
 * with `EmailSendingAccount: DEVELOPER` sends as the Cognito service through a
 * service-linked role, so the permissions of whoever called `SignUp` decide
 * nothing about it. Simulated Lambda triggers skip the `Invoke` command for
 * the same reason.
 *
 * The sandbox still applies. That is the point of routing a pool's messages
 * through here rather than recording them and calling it a send: an account
 * configured for SES and still in the sandbox is the way this fails in a
 * deployment.
 */
export class SimSesServiceSend {
  readonly #sent: SimSesSentEmailStore;
  readonly #identityCheck: SimSesVerifiedIdentityCheck;
  readonly #clock: SimClock;

  constructor(properties: SimSesServiceSendProperties) {
    this.#sent = properties.sent;
    this.#identityCheck = properties.identityCheck;
    this.#clock = properties.clock;
  }

  /**
   * Accept the message, or say why SES would have refused it.
   */
  send(request: SimSesServiceSendRequest): SimSesServiceSendResult {
    const refusedBecause = this.#identityCheck.refusal({
      fromEmailAddress: simSesBareAddress(request.fromEmailAddress),
      recipients: [request.toAddress],
    });

    if (refusedBecause !== undefined) {
      return { refusedBecause };
    }

    const messageId = randomUUID();

    this.#sent.add(
      new SimSesSentEmail({
        messageId,
        fromEmailAddress: request.fromEmailAddress,
        destination: {
          toAddresses: [request.toAddress],
          ccAddresses: [],
          bccAddresses: [],
        },
        replyToAddresses: [...request.replyToAddresses],
        subject: request.subject,
        body: { text: request.body, html: undefined },
        templateName: undefined,
        templateData: undefined,
        configurationSetName: request.configurationSetName,
        sentDate: this.#clock.now(),
      }),
    );

    return { messageId };
  }
}
