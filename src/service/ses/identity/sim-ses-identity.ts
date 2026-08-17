import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simSesIdentityArn } from "../sim-ses-arn.js";
import {
  simSesIdentityKey,
  simSesIdentityType,
  type SimSesIdentityType,
} from "./sim-ses-identity-name.js";

/**
 * How far along an identity's verification is, in SES's own vocabulary.
 *
 * Only two of the five real values occur here. Nothing in this simulator can
 * fail a verification or leave one in a temporary failure, because nothing
 * here does the checking that would fail: an identity is pending until a test
 * says it is verified.
 */
export type SimSesVerificationStatus = "PENDING" | "SUCCESS";

interface SimSesIdentityProperties {
  readonly emailIdentity: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly createdDate: Date;
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

  constructor(properties: SimSesIdentityProperties) {
    this.emailIdentity = properties.emailIdentity;
    this.key = simSesIdentityKey(properties.emailIdentity);
    this.identityType = simSesIdentityType(properties.emailIdentity);
    this.arn = simSesIdentityArn(
      properties.accountRegionScope,
      properties.emailIdentity,
    );
    this.createdDate = properties.createdDate;
  }

  get verificationStatus(): SimSesVerificationStatus {
    return this.#verificationStatus;
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
