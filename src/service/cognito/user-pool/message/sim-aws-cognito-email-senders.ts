import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimSesV2 } from "../../../ses/index.js";
import type {
  SimCognitoEmailSendFailure,
  SimCognitoEmailSendRequest,
  SimCognitoEmailSenders,
} from "./sim-cognito-email-senders.js";

interface SimAwsCognitoEmailSendersProperties {
  readonly simAws: SimAws;
}

/**
 * The simulated SES a user pool with `EmailSendingAccount: DEVELOPER` sends
 * through.
 *
 * A `SourceArn` names a region, and that region need not be the pool's own, so
 * the SES comes from the whole simulation rather than from the pool's scope.
 * The account is the pool's rather than the ARN's, for the reason
 * `SimCognitoEmailSourceIdentity` gives.
 */
export function simAwsCognitoEmailSenders(
  simAws: SimAws,
): SimCognitoEmailSenders {
  return new SimAwsCognitoEmailSenders({ simAws });
}

/**
 * The simulated SES of one simulated AWS instance, as a user pool's sender.
 *
 * The identity is resolved when a message is sent, never when the pool is
 * created, so a pool can be created before the identity it names and one
 * deleted afterwards fails the sign-up rather than having silently broken the
 * pool. That also leaves CloudFormation free to deploy the two in either
 * order.
 */
export class SimAwsCognitoEmailSenders implements SimCognitoEmailSenders {
  readonly #simAws: SimAws;

  constructor(properties: SimAwsCognitoEmailSendersProperties) {
    this.#simAws = properties.simAws;
  }

  /**
   * Send the message through SES, or say why the pool could not.
   *
   * The identity is checked first and separately from the send, because the
   * two failures are different exceptions on real Cognito and the one a
   * sign-up sees is what says which half of the configuration is wrong. An
   * identity that is missing or still unverified is the pool being unable to
   * use it at all. Everything after that is SES refusing the message, which
   * here means the sandbox.
   */
  send(
    request: SimCognitoEmailSendRequest,
  ): SimCognitoEmailSendFailure | undefined {
    const ses = this.sesFor(request);
    const identityRefusal = identityRefusalIn(ses, request);

    if (identityRefusal !== undefined) {
      return { kind: "identity", reason: identityRefusal };
    }

    const { refusedBecause } = ses.acceptServiceEmail({
      fromEmailAddress: request.from,
      toAddress: request.recipient,
      replyToAddresses: request.replyToAddresses,
      subject: request.subject,
      body: request.body,
      configurationSetName: request.configurationSet,
    });

    return refusedBecause === undefined
      ? undefined
      : { kind: "delivery", reason: refusedBecause };
  }

  private sesFor(request: SimCognitoEmailSendRequest): SimSesV2 {
    return this.#simAws
      .accountRegionScope(request.accountId, request.identity.regionName)
      .sesV2();
  }
}

/**
 * Why the pool may not send as this identity, or nothing where it may.
 *
 * Real Cognito needs the identity to exist, to be verified, and to carry an
 * identity policy letting Cognito send as it. The policy is the part left out:
 * simulated SES has no identity policies, so a verified identity is as far as
 * the check goes.
 */
function identityRefusalIn(
  ses: SimSesV2,
  request: SimCognitoEmailSendRequest,
): string | undefined {
  const { identityName, regionName } = request.identity;
  const identity = ses.findIdentity(identityName);

  if (identity === undefined) {
    return (
      `${identityName} is not a simulated SES email identity in ` +
      `${regionName}. Verify it with sesV2().verifyIdentity(...) in that ` +
      `region, or point the pool's SourceArn at one that is there.`
    );
  }

  if (!identity.isVerified) {
    return (
      `${identityName} is a simulated SES email identity in ${regionName} ` +
      `that has not completed verification. Verify it with ` +
      `sesV2().verifyIdentity(...).`
    );
  }

  return undefined;
}
