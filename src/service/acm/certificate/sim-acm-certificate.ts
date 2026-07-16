import type { SimArn } from "../../aws/arn.js";

export type SimAcmCertificateStatus =
  | "EXPIRED"
  | "FAILED"
  | "INACTIVE"
  | "ISSUED"
  | "PENDING_VALIDATION"
  | "REVOKED"
  | "VALIDATION_TIMED_OUT";
export type SimAcmValidationMethod = "DNS" | "EMAIL" | "HTTP";

export interface SimAcmTag {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

export interface SimAcmValidationRecord {
  readonly name: string;
  readonly type: "CNAME";
  readonly value: string;
}

export interface SimAcmDomainValidationOption {
  readonly domainName: string;
  readonly validationMethod?: SimAcmValidationMethod | undefined;
  readonly resourceRecord?: SimAcmValidationRecord | undefined;
}

interface SimAcmCertificateProps {
  readonly certificateArn: SimArn;
  readonly domainName: string;
  readonly subjectAlternativeNames?: readonly string[] | undefined;
  readonly status?: SimAcmCertificateStatus | undefined;
  readonly validationMethod?: SimAcmValidationMethod | undefined;
  readonly domainValidationOptions?:
    readonly SimAcmDomainValidationOption[] | undefined;
  readonly createdAt?: Date | undefined;
  readonly issuedAt?: Date | undefined;
  readonly tags?: readonly SimAcmTag[] | undefined;
}

/**
 * Simulated ACM Certificate.
 */
export class SimAcmCertificate {
  public readonly certificateArn: SimArn;
  public readonly domainName: string;
  public readonly subjectAlternativeNames: readonly string[];
  public readonly validationMethod?: SimAcmValidationMethod | undefined;
  public readonly domainValidationOptions: readonly SimAcmDomainValidationOption[];
  public readonly createdAt: Date;
  public readonly tags?: readonly SimAcmTag[] | undefined;

  #issuedAt: Date | undefined;
  #status: SimAcmCertificateStatus;

  constructor(props: SimAcmCertificateProps) {
    const {
      certificateArn,
      domainName,
      subjectAlternativeNames = [],
      status = "PENDING_VALIDATION",
      validationMethod,
      domainValidationOptions = [],
      createdAt = new Date(),
      issuedAt,
      tags,
    } = props;

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
   * Move the sim Certificate into ISSUED status.
   */
  issue(): Promise<void> {
    this.#status = "ISSUED";
    this.#issuedAt = new Date();
    return Promise.resolve();
  }
}
