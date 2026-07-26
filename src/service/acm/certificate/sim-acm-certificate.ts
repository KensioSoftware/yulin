import type { SimArn } from "../../aws/arn.js";
import type {
  SimAcmDomainValidation,
  SimAcmValidationMethod,
} from "./sim-acm-domain-validation.js";
import { type SimClock, SimRealClock } from "../../../util/clock/sim-clock.js";

export type SimAcmCertificateStatus =
  | "EXPIRED"
  | "FAILED"
  | "INACTIVE"
  | "ISSUED"
  | "PENDING_VALIDATION"
  | "REVOKED"
  | "VALIDATION_TIMED_OUT";

export interface SimAcmTag {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

interface SimAcmCertificateProperties {
  readonly certificateArn: SimArn;
  readonly domainName: string;
  readonly subjectAlternativeNames?: readonly string[] | undefined;
  readonly status?: SimAcmCertificateStatus | undefined;
  readonly validationMethod?: SimAcmValidationMethod | undefined;
  readonly domainValidationOptions?:
    readonly SimAcmDomainValidation[] | undefined;
  readonly createdAt?: Date | undefined;
  readonly issuedAt?: Date | undefined;
  readonly tags?: readonly SimAcmTag[] | undefined;
  /**
   * Clock stamping this Certificate's created and issued times. A Certificate
   * built standalone, outside a SimAws instance, falls back to the real clock.
   */
  readonly clock?: SimClock | undefined;
}

/**
 * Simulated ACM Certificate.
 */
export class SimAcmCertificate {
  public readonly certificateArn: SimArn;
  public readonly domainName: string;
  public readonly subjectAlternativeNames: readonly string[];
  public readonly validationMethod?: SimAcmValidationMethod | undefined;
  public readonly domainValidationOptions: readonly SimAcmDomainValidation[];
  public readonly createdAt: Date;
  public readonly tags?: readonly SimAcmTag[] | undefined;

  #issuedAt: Date | undefined;
  #status: SimAcmCertificateStatus;
  private readonly clock: SimClock;

  constructor(properties: SimAcmCertificateProperties) {
    const {
      certificateArn,
      domainName,
      subjectAlternativeNames = [],
      status = "PENDING_VALIDATION",
      validationMethod,
      domainValidationOptions = [],
      clock = new SimRealClock(),
      createdAt = clock.now(),
      issuedAt,
      tags,
    } = properties;

    this.clock = clock;

    this.certificateArn = certificateArn;
    this.domainName = domainName;
    this.subjectAlternativeNames = subjectAlternativeNames;
    this.#status = status;
    this.validationMethod = validationMethod;
    this.domainValidationOptions = domainValidationOptions;
    this.createdAt = createdAt;
    this.#issuedAt = issuedAt;
    this.tags = tags;
  }

  /**
   * Get the current Status of this sim Certificate.
   */
  get status(): SimAcmCertificateStatus {
    return this.#status;
  }

  /**
   * Get when this sim Certificate was issued.
   */
  get issuedAt(): Date | undefined {
    return this.#issuedAt;
  }

  /**
   * Whether every domain name on this sim Certificate has been validated.
   *
   * ACM issues a certificate only once ownership of all of its domain names is
   * proven, so this is the gate the validation flow waits on.
   */
  get isValidated(): boolean {
    return this.domainValidationOptions.every(
      (domainValidation) => domainValidation.hasSucceeded,
    );
  }

  /**
   * Move the sim Certificate into ISSUED status.
   *
   * Issuing implies every domain name was validated, so any domain validation
   * still pending is marked successful here. That keeps the per-domain
   * statuses consistent with the certificate status for the paths that issue a
   * certificate without waiting for DNS, such as EMAIL validation.
   */
  issue(): Promise<void> {
    this.#status = "ISSUED";
    this.#issuedAt = this.clock.now();

    for (const domainValidation of this.domainValidationOptions) {
      domainValidation.succeed();
    }

    return Promise.resolve();
  }
}
