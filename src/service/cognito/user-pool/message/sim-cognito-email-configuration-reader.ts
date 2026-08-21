import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import {
  simCognitoEmailSourceIdentity,
  type SimCognitoEmailSourceIdentity,
} from "./sim-cognito-email-source-arn.js";
import {
  simCognitoEmailSendingAccounts,
  type SimCognitoEmailConfigurationType,
  type SimCognitoEmailSendingAccount,
} from "./sim-cognito-email-configuration.js";

/**
 * Reads the keys of one `EmailConfiguration`, refusing a value Cognito would
 * refuse.
 *
 * The configuration arrives as a bare object because CloudFormation hands one
 * over with whatever a template wrote in it, so every key is checked here
 * rather than trusted from the type.
 */
export class SimCognitoEmailConfigurationReader {
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

    if (!simCognitoEmailSendingAccounts.includes(declared)) {
      throw new SimCognitoInvalidParameterException(
        `${this.#operation} EmailConfiguration EmailSendingAccount ` +
          `'${declared}' is not one of ${simCognitoEmailSendingAccounts.join(", ")}`,
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
