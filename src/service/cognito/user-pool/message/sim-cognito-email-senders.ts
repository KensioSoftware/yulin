import type { SimAwsAccountId } from "../../../aws/sim-aws-account-id.js";
import type { SimCognitoEmailSourceIdentity } from "./sim-cognito-email-source-arn.js";

/**
 * A pool asking to send one message through the account's SES.
 *
 * The account travels with the request because a pool resolves its identity in
 * its own account: the `SourceArn` says which region and which identity, and
 * the pool says which account. See `SimCognitoEmailSourceIdentity` for why the
 * account in the ARN is read past.
 */
export interface SimCognitoEmailSendRequest {
  readonly identity: SimCognitoEmailSourceIdentity;
  readonly accountId: SimAwsAccountId;
  readonly from: string;
  readonly replyToAddresses: readonly string[];
  readonly configurationSet: string | undefined;
  readonly recipient: string;
  readonly subject: string;
  readonly body: string;
}

/**
 * Which of a pool's two email failures happened.
 *
 * Real Cognito reports them as two different exceptions, and they mean
 * different things to whoever has to fix the deployment. `identity` is the
 * pool being unable to use the SES identity at all. `delivery` is SES
 * refusing the message, which in a simulation means the sandbox.
 */
export type SimCognitoEmailSendFailureKind = "identity" | "delivery";

/**
 * Why a pool's message never reached SES.
 */
export interface SimCognitoEmailSendFailure {
  readonly kind: SimCognitoEmailSendFailureKind;

  /**
   * What went wrong, repeated back in the exception whoever has to fix the
   * configuration reads.
   */
  readonly reason: string;
}

/**
 * The narrow slice of simulated SES a user pool with `EmailSendingAccount:
 * DEVELOPER` needs.
 *
 * A pool asks one thing: send this message, and say why if it could not. The
 * SES it asks is the one in the region its `SourceArn` names, which need not
 * be the pool's own region, so the senders come from the whole simulation
 * rather than from the scope the pool belongs to. Pool triggers reach Lambda
 * the same way and for the same reason.
 *
 * A failure comes back rather than being thrown, because SES's vocabulary for
 * a refused send is not the pool's: the pool reports it as the Cognito
 * exception a sign-up would see on real AWS.
 */
export interface SimCognitoEmailSenders {
  send(
    request: SimCognitoEmailSendRequest,
  ): SimCognitoEmailSendFailure | undefined;
}

/**
 * The email senders of a simulated Cognito built without simulated SES, such
 * as a standalone `SimCognitoIdentityProvider` constructed outside `SimAws`.
 *
 * A pool can still be created with an `EmailConfiguration`, because the
 * identity is only resolved when a message is sent. It is the sign-up that
 * says there is no SES to reach, rather than the pool creation that would have
 * to guess.
 */
export class SimCognitoNoEmailSenders implements SimCognitoEmailSenders {
  /**
   * Refuse the send, explaining how to reach an SES.
   */
  send(request: SimCognitoEmailSendRequest): SimCognitoEmailSendFailure {
    return {
      kind: "identity",
      reason:
        `${request.identity.identityName} cannot be reached: this ` +
        `SimCognitoIdentityProvider was built without simulated SES. Reach ` +
        `Cognito through SimAws to send a user pool's email through SES.`,
    };
  }
}
