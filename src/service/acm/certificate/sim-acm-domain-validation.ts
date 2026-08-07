export type SimAcmValidationMethod = "DNS" | "EMAIL" | "HTTP";

export type SimAcmDomainValidationStatus =
  | "FAILED"
  | "PENDING_VALIDATION"
  | "SUCCESS";

export interface SimAcmValidationRecord {
  readonly name: string;
  readonly type: "CNAME";
  readonly value: string;
}

interface SimAcmDomainValidationProperties {
  readonly domainName: string;
  readonly validationMethod?: SimAcmValidationMethod | undefined;
  readonly resourceRecord?: SimAcmValidationRecord | undefined;
  readonly status?: SimAcmDomainValidationStatus | undefined;
}

/**
 * Validation state for one domain name on a simulated ACM Certificate.
 *
 * ACM validates every domain on a certificate separately, so a certificate
 * with subject alternative names can have some domains already validated while
 * others are still waiting for their DNS record. The certificate is only
 * issued once every domain has succeeded.
 */
export class SimAcmDomainValidation {
  public readonly domainName: string;
  public readonly validationMethod?: SimAcmValidationMethod | undefined;
  public readonly resourceRecord?: SimAcmValidationRecord | undefined;

  #status: SimAcmDomainValidationStatus;

  constructor(properties: SimAcmDomainValidationProperties) {
    const {
      domainName,
      validationMethod,
      resourceRecord,
      status = "PENDING_VALIDATION",
    } = properties;

    this.domainName = domainName;
    this.validationMethod = validationMethod;
    this.resourceRecord = resourceRecord;
    this.#status = status;
  }

  /**
   * Get the current validation status for this domain name.
   */
  get status(): SimAcmDomainValidationStatus {
    return this.#status;
  }

  /**
   * Whether this domain name is still waiting to be validated.
   */
  get isPending(): boolean {
    return this.#status === "PENDING_VALIDATION";
  }

  /**
   * Whether this domain name has been validated.
   */
  get hasSucceeded(): boolean {
    return this.#status === "SUCCESS";
  }

  /**
   * Record this domain name as validated.
   */
  succeed(): void {
    this.#status = "SUCCESS";
  }
}
