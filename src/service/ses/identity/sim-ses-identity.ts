import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simSesIdentityArn } from "../sim-ses-arn.js";
import { simSesDkimTokens } from "./sim-ses-dkim-tokens.js";
import {
  simSesIdentityKey,
  simSesIdentityType,
  type SimSesIdentityType,
} from "./sim-ses-identity-name.js";
import {
  defaultSimSesIdentitySettings,
  type SimSesIdentitySettings,
} from "./sim-ses-identity-settings.js";

/**
 * How far along an identity's verification is, in SES's own vocabulary.
 *
 * Only two of the five real values occur here. Nothing in this simulator can
 * fail a verification or leave one in a temporary failure, because nothing
 * here does the checking that would fail: an identity is pending until a test
 * says it is verified.
 */
export type SimSesVerificationStatus = "PENDING" | "SUCCESS";

/** What DKIM signing reports when the identity was configured without it. */
export type SimSesDkimStatus = SimSesVerificationStatus | "NOT_STARTED";

interface SimSesIdentityProperties {
  readonly emailIdentity: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly createdDate: Date;
  readonly settings?: SimSesIdentitySettings | undefined;
}

/**
 * One email address or domain SES has been asked to send from.
 *
 * An identity starts unverified and stays that way until something says
 * otherwise. Real SES verifies an address by emailing it a link and a domain
 * by looking for DNS records, and neither of those can happen inside a test
 * process, so verification here is a simulator-side act rather than an API
 * operation.
 */
export class SimSesIdentity {
  /** The address or domain, spelled as it was given. */
  public readonly emailIdentity: string;

  /** How this identity is looked up, so two spellings of it meet. */
  public readonly key: string;

  public readonly identityType: SimSesIdentityType;

  public readonly arn: string;

  public readonly createdDate: Date;

  #verificationStatus: SimSesVerificationStatus = "PENDING";

  #settings: SimSesIdentitySettings;

  constructor(properties: SimSesIdentityProperties) {
    this.emailIdentity = properties.emailIdentity;
    this.key = simSesIdentityKey(properties.emailIdentity);
    this.identityType = simSesIdentityType(properties.emailIdentity);
    this.arn = simSesIdentityArn(
      properties.accountRegionScope,
      properties.emailIdentity,
    );
    this.createdDate = properties.createdDate;
    this.#settings =
      properties.settings ?? defaultSimSesIdentitySettings(this.identityType);
  }

  get verificationStatus(): SimSesVerificationStatus {
    return this.#verificationStatus;
  }

  /**
   * What this identity was configured with beyond its name.
   *
   * Held and reported, never acted on. `GetEmailIdentity` reads it back so a
   * test can assert that the identity a stack deployed is the one the stack
   * described.
   */
  get settings(): SimSesIdentitySettings {
    return this.#settings;
  }

  /**
   * Whether SES would let a message be sent from this identity.
   *
   * Real SES reports this separately from the verification status because an
   * account under enforcement can hold a verified identity it may not send
   * from. Nothing here puts an account under enforcement, so the two agree.
   */
  get isVerified(): boolean {
    return this.#verificationStatus === "SUCCESS";
  }

  /**
   * How far along DKIM signing is for this identity.
   *
   * An identity configured without signing reports `NOT_STARTED`. One
   * configured with it follows the identity's own verification, since the DNS
   * records that would prove either are published together and this simulator
   * has one act standing for all of them.
   */
  get dkimStatus(): SimSesDkimStatus {
    return this.settings.dkim.signingEnabled
      ? this.#verificationStatus
      : "NOT_STARTED";
  }

  /**
   * The three Easy DKIM tokens for this identity, where it has any.
   *
   * Bring Your Own DKIM publishes one record under a selector the caller
   * chose, so real SES reports no tokens for it. An email address identity
   * has none either, since the records belong to the domain.
   */
  get dkimTokens(): readonly string[] | undefined {
    if (
      !this.settings.dkim.signingEnabled ||
      this.settings.dkim.signingOrigin === "EXTERNAL" ||
      this.identityType !== "DOMAIN"
    ) {
      return undefined;
    }

    return simSesDkimTokens(this.emailIdentity);
  }

  /**
   * Replace what this identity is configured with.
   *
   * Real SES configures an identity after creating it, through
   * `PutEmailIdentityDkimAttributes` and the two commands beside it, and real
   * CloudFormation makes those calls itself. Neither of those commands is
   * simulated, so a deploy reaches this instead.
   */
  configure(settings: SimSesIdentitySettings): void {
    this.#settings = settings;
  }

  /**
   * Treat this identity as having completed verification.
   *
   * This stands in for clicking the link SES emails, or for the DNS records a
   * domain identity waits on. It is the simulator's own operation and no SES
   * API call reaches it.
   */
  verify(): void {
    this.#verificationStatus = "SUCCESS";
  }

  /**
   * Put this identity back to waiting on its verification.
   *
   * Real SES moves an identity out of `SUCCESS` when the records that proved
   * it stop resolving, so a test that wants to see sending fail after it once
   * worked has somewhere to go.
   */
  unverify(): void {
    this.#verificationStatus = "PENDING";
  }
}
