import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import {
  simCognitoEmailSourceIdentity,
  type SimCognitoEmailSourceIdentity,
} from "./sim-cognito-email-source-arn.js";

/**
 * Which service delivers a pool's email.
 *
 * `COGNITO_DEFAULT` is Cognito's own sending, capped at a low daily limit on
 * real AWS. `DEVELOPER` is the account's own SES.
 */
export type SimCognitoEmailSendingAccount = "COGNITO_DEFAULT" | "DEVELOPER";

const sendingAccounts: readonly string[] = ["COGNITO_DEFAULT", "DEVELOPER"];

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
   * A pool that named no `From` sends from the identity its `SourceArn` names,
   * as real Cognito does, and one with neither sends from Cognito's own
   * address.
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

    this.#declared = read.declared;
    this.sendingAccount = read.sendingAccount();
    this.configurationSet = read.string("ConfigurationSet");
    this.replyToEmailAddress = read.string("ReplyToEmailAddress");
    this.from =
      read.string("From") ??
      sourceIdentity?.identityName ??
      simCognitoDefaultFromAddress;
    this.sourceIdentity =
      this.sendingAccount === "DEVELOPER" ? sourceIdentity : undefined;

    if (sourceIdentity === undefined && this.sendingAccount === "DEVELOPER") {
      throw new SimCognitoInvalidParameterException(
        `${operation} EmailConfiguration with EmailSendingAccount ` +
          `'DEVELOPER' needs a SourceArn naming the SES email identity the ` +
          `pool sends through`,
      );
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
 * Reads the keys of one `EmailConfiguration`, refusing a value Cognito would
 * refuse.
 *
 * The configuration arrives as a bare object because CloudFormation hands one
 * over with whatever a template wrote in it, so every key is checked here
 * rather than trusted from the type.
 */
class SimCognitoEmailConfigurationReader {
  /** The configuration as given, which is also what a describe reports. */
  public readonly declared: SimCognitoEmailConfigurationType | undefined;

  readonly #operation: string;

  /**
   * The keys as given, held in a Map rather than read off the object. What
   * arrives is whatever a template wrote, so a key such as `__proto__` reaches
   * here and a Map is where it means nothing.
   */
  readonly #values: ReadonlyMap<string, unknown>;

  constructor(declared: object | undefined, operation: string) {
    this.declared = declared;
    this.#operation = operation;
    this.#values = new Map(Object.entries(declared ?? {}));
  }

  /**
   * One key that has to be a string where it is there at all.
   */
  string(key: string): string | undefined {
    const value = this.#values.get(key);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw new SimCognitoInvalidParameterException(
        `${this.#operation} EmailConfiguration ${key} must be a string`,
      );
    }

    return value;
  }

  /**
   * Which service the configuration asked to send through, refusing a value
   * Cognito has no meaning for.
   */
  sendingAccount(): SimCognitoEmailSendingAccount {
    const declared = this.string("EmailSendingAccount");

    if (declared === undefined) {
      return "COGNITO_DEFAULT";
    }

    if (!sendingAccounts.includes(declared)) {
      throw new SimCognitoInvalidParameterException(
        `${this.#operation} EmailConfiguration EmailSendingAccount ` +
          `'${declared}' is not one of ${sendingAccounts.join(", ")}`,
      );
    }

    return declared as SimCognitoEmailSendingAccount;
  }

  /**
   * The identity a `SourceArn` names, refusing a value that names something
   * other than an SES email identity.
   */
  sourceIdentity(): SimCognitoEmailSourceIdentity | undefined {
    const sourceArn = this.string("SourceArn");

    if (sourceArn === undefined) {
      return undefined;
    }

    const identity = simCognitoEmailSourceIdentity(sourceArn);

    if (identity === undefined) {
      throw new SimCognitoInvalidParameterException(
        `${this.#operation} EmailConfiguration SourceArn '${sourceArn}' is ` +
          `not the ARN of an SES email identity`,
      );
    }

    return identity;
  }
}
