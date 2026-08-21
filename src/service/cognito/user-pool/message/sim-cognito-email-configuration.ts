import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import { SimCognitoEmailConfigurationReader } from "./sim-cognito-email-configuration-reader.js";
import type { SimCognitoEmailSourceIdentity } from "./sim-cognito-email-source-arn.js";

/**
 * Which service delivers a pool's email.
 *
 * `COGNITO_DEFAULT` is Cognito's own sending, capped at a low daily limit on
 * real AWS. `DEVELOPER` is the account's own SES.
 */
export type SimCognitoEmailSendingAccount = "COGNITO_DEFAULT" | "DEVELOPER";

/**
 * The two values `EmailSendingAccount` has, which is also what a refusal of a
 * third names.
 */
export const simCognitoEmailSendingAccounts: readonly string[] = [
  "COGNITO_DEFAULT",
  "DEVELOPER",
];

/**
 * The address real Cognito sends from when it is sending the email itself and
 * was given no other one.
 */
export const simCognitoDefaultFromAddress = "no-reply@verificationemail.com";

/**
 * A pool's `EmailConfiguration`, as a described pool reports it.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_EmailConfigurationType.html
 */
export interface SimCognitoEmailConfigurationType {
  readonly ConfigurationSet?: string | undefined;
  readonly EmailSendingAccount?: string | undefined;
  readonly From?: string | undefined;
  readonly ReplyToEmailAddress?: string | undefined;
  readonly SourceArn?: string | undefined;
}

/**
 * How a simulated user pool sends the messages it writes.
 *
 * A pool with no `EmailConfiguration`, and one that named `COGNITO_DEFAULT`,
 * send through Cognito itself. The pool records what it would have sent and
 * nothing else observes it, because on real AWS nothing else does either:
 * Cognito's built-in sending goes through no other service, so there is no
 * second place a test could read it from.
 *
 * A pool that named `DEVELOPER` sends through the account's SES in the region
 * its `SourceArn` names, and the message is recorded there as well as on the
 * pool. That is the difference the whole setting exists for, and the reason it
 * is simulated rather than refused: an account configured for SES and still in
 * the SES sandbox delivers nothing, and a pool recording only its own messages
 * would report that as a working sign-up.
 *
 * `SourceArn` is read for its region and identity name only. See
 * `SimCognitoEmailSourceIdentity` for why the account id in it is read past.
 */
export class SimCognitoEmailConfiguration {
  public readonly sendingAccount: SimCognitoEmailSendingAccount;

  /**
   * The address the messages come from, with the display name where the
   * configuration gave one.
   *
   * A pool that named no `From` sends from the address its `SourceArn` names,
   * as real Cognito does, and one with neither sends from Cognito's own
   * address. A `SourceArn` naming a domain has no address to fall back on, so
   * such a pool has to say what its `From` is.
   */
  public readonly from: string;

  public readonly replyToEmailAddress: string | undefined;

  public readonly configurationSet: string | undefined;

  /**
   * The SES identity the pool sends through, and nothing where the pool sends
   * through Cognito itself.
   *
   * A `COGNITO_DEFAULT` pool with a `SourceArn` has one on real AWS too, and
   * uses it only as the address the built-in sending writes as. It is left out
   * here because nothing reads it: the `From` above already carries it.
   */
  public readonly sourceIdentity: SimCognitoEmailSourceIdentity | undefined;

  readonly #declared: SimCognitoEmailConfigurationType | undefined;

  constructor(declared: object | undefined, operation: string) {
    const read = new SimCognitoEmailConfigurationReader(declared, operation);
    const sourceIdentity = read.sourceIdentity();
    const declaredFrom = read.string("From");

    this.#declared = read.declared;
    this.sendingAccount = read.sendingAccount();
    this.configurationSet = read.string("ConfigurationSet");
    this.replyToEmailAddress = read.string("ReplyToEmailAddress");
    this.from =
      declaredFrom ?? addressOf(sourceIdentity) ?? simCognitoDefaultFromAddress;
    this.sourceIdentity =
      this.sendingAccount === "DEVELOPER" ? sourceIdentity : undefined;

    if (this.sendingAccount === "DEVELOPER") {
      refuseWithoutSender(operation, sourceIdentity, declaredFrom);
    }
  }

  /**
   * The configuration as `DescribeUserPool` reports it, and nothing for a pool
   * that declared none.
   *
   * Real Cognito reports back what the request set rather than the defaults
   * behind it, so a pool created without an `EmailConfiguration` describes
   * itself without one even though it sends from Cognito's own address.
   */
  toOutput(): SimCognitoEmailConfigurationType | undefined {
    return this.#declared;
  }
}

/**
 * The address an identity gives a pool to send as, and nothing for a domain.
 *
 * A domain identity covers every address at it and names none of them, so
 * there is nothing here for a `From` to default to.
 */
function addressOf(
  identity: SimCognitoEmailSourceIdentity | undefined,
): string | undefined {
  return identity === undefined || identity.isDomain
    ? undefined
    : identity.identityName;
}

/**
 * Refuse a pool that sends through SES without saying what it sends as.
 *
 * Real Cognito needs the `SourceArn`, because the identity is what the account
 * has proved it owns. It needs the `From` as well where that identity is a
 * domain, since a domain gives it no one address to write as.
 */
function refuseWithoutSender(
  operation: string,
  sourceIdentity: SimCognitoEmailSourceIdentity | undefined,
  declaredFrom: string | undefined,
): void {
  if (sourceIdentity === undefined) {
    throw new SimCognitoInvalidParameterException(
      `${operation} EmailConfiguration with EmailSendingAccount 'DEVELOPER' ` +
        `needs a SourceArn naming the SES email identity the pool sends ` +
        `through`,
    );
  }

  if (declaredFrom === undefined && sourceIdentity.isDomain) {
    throw new SimCognitoInvalidParameterException(
      `${operation} EmailConfiguration with a SourceArn naming the domain ` +
        `'${sourceIdentity.identityName}' needs a From address, because a ` +
        `domain identity gives Cognito no one address to send as`,
    );
  }
}
