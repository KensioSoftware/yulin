import { SimS3InvalidRequest } from "../../error/sim-s3.error.js";
import {
  simS3ComplianceMode,
  simS3GovernanceMode,
  type SimS3ObjectRetention,
} from "./sim-s3-object-retention.js";

/** The two values `LegalHold.Status` takes. */
export const simS3LegalHoldOn = "ON";
export const simS3LegalHoldOff = "OFF";

/** The two statuses, as a refusal names them. */
const legalHoldStatuses = `${simS3LegalHoldOn} or ${simS3LegalHoldOff}`;

/**
 * Structural shape of an S3 ObjectLockLegalHold.
 */
export interface SimS3LegalHoldInput {
  readonly Status?: string | undefined;
}

/**
 * What Object Lock holds against one version of one Object.
 *
 * A retention period and a legal hold are configured independently and either
 * one on its own refuses a delete. The difference is that a retention lapses
 * when simulated time passes it and a legal hold has no expiry to wait out, so
 * the only way past one is to take it off.
 *
 * This is mutable, unlike the version holding it. Real S3 changes both through
 * requests of their own against a version that is already there, and a version
 * whose retention could not change would have no PutObjectRetention.
 */
export class SimS3ObjectLock {
  private retention: SimS3ObjectRetention | undefined;
  private legalHold = false;

  /**
   * Put a retention on this version, refusing one real S3 refuses.
   *
   * Object Lock is a guarantee rather than a setting, so the ways out of one
   * are the point. A compliance retention can be extended and never shortened,
   * by anyone, including the account root. A governance retention can be
   * shortened or dropped by a caller who names `BypassGovernanceRetention`,
   * and the caller's permission to do that is checked before this is reached.
   */
  applyRetention(retention: SimS3ObjectRetention, bypassed: boolean): void {
    const held = this.retention;

    if (held === undefined || retention.isAtLeast(held)) {
      this.retention = retention;
      return;
    }

    if (bypassed && held.mode === simS3GovernanceMode) {
      this.retention = retention;
      return;
    }

    throw new SimS3InvalidRequest(
      held.mode === simS3ComplianceMode
        ? "A COMPLIANCE retention period can be extended and never shortened"
        : "Shortening a GOVERNANCE retention period requires " +
            "BypassGovernanceRetention",
    );
  }

  /**
   * Turn the legal hold on this version on or off.
   */
  applyLegalHold(input: SimS3LegalHoldInput): void {
    if (
      input.Status !== simS3LegalHoldOn &&
      input.Status !== simS3LegalHoldOff
    ) {
      throw new SimS3InvalidRequest(
        `Object Lock legal hold Status has to be ${legalHoldStatuses}`,
      );
    }

    this.legalHold = input.Status === simS3LegalHoldOn;
  }

  /**
   * Set the retention a Bucket's default puts on a new version.
   *
   * Nothing is checked, because a version this is reached for has just been
   * written and carries no retention to be shortening.
   */
  setDefaultRetention(retention: SimS3ObjectRetention): void {
    this.retention = retention;
  }

  /**
   * Whether Object Lock refuses to let this version be deleted.
   *
   * A legal hold refuses whatever the caller says, since there is no bypass
   * for one. A retention that has lapsed refuses nothing, which is what makes
   * advancing the clock the way past a governance or a compliance period.
   */
  refusesDeleteAt(instant: Date, bypassed: boolean): string | undefined {
    if (this.legalHold) {
      return "it is under a legal hold";
    }

    const retention = this.retention;

    if (retention === undefined || !retention.isActiveAt(instant)) {
      return undefined;
    }

    if (bypassed && retention.mode === simS3GovernanceMode) {
      return undefined;
    }

    return `it is under a ${retention.mode} retention period until ${retention.retainUntilDate.toISOString()}`;
  }

  /** What GetObject and HeadObject report about the version. */
  get reported(): Record<string, string | Date> {
    return {
      ...this.retention?.reported,
      ...(this.legalHold && { ObjectLockLegalHoldStatus: simS3LegalHoldOn }),
    };
  }
}
