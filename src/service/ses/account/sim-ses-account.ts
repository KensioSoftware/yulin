import type { SimSesSuppressionReason } from "../suppression/sim-ses-suppression-reason.js";

/**
 * How much an account may send, which is one of the two things leaving the
 * sandbox changes.
 */
export interface SimSesSendQuota {
  readonly max24HourSend: number;
  readonly maxSendRate: number;
}

/**
 * What a sandbox account may send. These are the real SES sandbox limits.
 */
const sandboxQuota: SimSesSendQuota = { max24HourSend: 200, maxSendRate: 1 };

/**
 * What an account with production access may send.
 *
 * Real SES sets these per account, raising them as sending reputation builds,
 * so this is the starting point rather than a fixed ceiling.
 */
const productionQuota: SimSesSendQuota = {
  max24HourSend: 50_000,
  maxSendRate: 14,
};

/**
 * The contact details `PutAccountDetails` carries, kept so `GetAccount` can
 * report them back.
 */
export interface SimSesAccountContactDetails {
  readonly mailType: string;
  readonly websiteUrl: string;
  readonly contactLanguage: string | undefined;
  readonly useCaseDescription: string | undefined;
  readonly additionalContactEmailAddresses: readonly string[] | undefined;
}

/**
 * The account-wide SES settings of one region.
 *
 * An account starts in the sandbox, which is where every real one starts and
 * the state most tests should be written against: it is the configuration that
 * refuses to mail an address nobody verified, and that refusal is the whole
 * point of having identities at all.
 *
 * Neither quota is enforced. Simulating the daily cap would mean a test suite
 * that sent two hundred messages started failing for a reason unrelated to
 * what it asserts, and simulating the per-second rate would mean tests that
 * take real time to run. The numbers are reported so a caller reading them
 * gets the shape it expects, and the divergence is documented rather than
 * quietly enforced.
 */
export class SimSesAccount {
  #productionAccessEnabled = false;
  #contactDetails: SimSesAccountContactDetails | undefined;
  #suppressedReasons: readonly SimSesSuppressionReason[] = [
    "BOUNCE",
    "COMPLAINT",
  ];

  /**
   * Whether this account has left the sandbox.
   */
  get productionAccessEnabled(): boolean {
    return this.#productionAccessEnabled;
  }

  /**
   * Whether the sandbox rules apply, which is the same question the other way
   * round. Sending code reads it this way, so it is named this way too.
   */
  get isInSandbox(): boolean {
    return !this.#productionAccessEnabled;
  }

  get sendQuota(): SimSesSendQuota {
    return this.#productionAccessEnabled ? productionQuota : sandboxQuota;
  }

  get contactDetails(): SimSesAccountContactDetails | undefined {
    return this.#contactDetails;
  }

  /**
   * The reasons this account holds addresses back for.
   *
   * Both are set to begin with, which is where every account opened after
   * November 2019 starts. An account with neither has the suppression list
   * turned off, and a listed address is mailed anyway.
   */
  get suppressedReasons(): readonly SimSesSuppressionReason[] {
    return this.#suppressedReasons;
  }

  /**
   * Whether this account holds a message back from an address listed for a
   * reason.
   *
   * The two have to match. An address on the list for `COMPLAINT` under an
   * account suppressing only `BOUNCE` is mailed, which is the part of the
   * suppression rules most easily got wrong.
   */
  isSuppressedFor(reason: SimSesSuppressionReason): boolean {
    return this.#suppressedReasons.includes(reason);
  }

  /**
   * Set the reasons this account holds addresses back for.
   */
  putSuppressedReasons(reasons: readonly SimSesSuppressionReason[]): void {
    this.#suppressedReasons = [...reasons];
  }

  /**
   * Record the account details, and leave the sandbox if they ask to.
   *
   * Real SES treats `ProductionAccessEnabled` as a request that a human at AWS
   * then reviews, so an account does not leave the sandbox the moment this
   * returns. Granting it immediately is the divergence worth taking: the
   * alternative is a simulator no test can get out of the sandbox in, and
   * waiting for a review is not behaviour a test can assert on anyway.
   */
  putDetails(
    details: SimSesAccountContactDetails,
    productionAccessEnabled: boolean,
  ): void {
    this.#contactDetails = details;
    this.#productionAccessEnabled = productionAccessEnabled;
  }
}
