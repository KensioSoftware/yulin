import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAcmCertificate } from "../certificate/sim-acm-certificate.js";
import type {
  SimAcmDomainValidation,
  SimAcmValidationRecord,
} from "../certificate/sim-acm-domain-validation.js";
import type { SimAcmDnsRecords } from "./sim-acm-dns-records.js";
import { SimAcmDnsValidationMode } from "./sim-acm-dns-validation-mode.js";

interface SimAcmCertificateValidationProperties {
  readonly background: BackgroundScheduler;
  readonly dnsRecords?: SimAcmDnsRecords | undefined;
}

/**
 * Drives sim ACM Certificate issuance through domain validation.
 *
 * A requested Certificate is evaluated once as background work, and then again
 * whenever DNS records change, until every domain name on it is validated. The
 * re-evaluation is driven by DNS record changes rather than by polling, so
 * draining simulator background tasks always terminates: a Certificate whose
 * validation record never appears simply stays pending.
 */
export class SimAcmCertificateValidation {
  private readonly background: BackgroundScheduler;
  private readonly dnsRecords: SimAcmDnsRecords | undefined;
  private readonly pendingCertificates = new Set<SimAcmCertificate>();
  private mode = SimAcmDnsValidationMode.auto();
  private listeningForRecordChanges = false;

  constructor(properties: SimAcmCertificateValidationProperties) {
    this.background = properties.background;
    this.dnsRecords = properties.dnsRecords;
  }

  /**
   * Always require a DNS validation record before issuing a Certificate.
   *
   * With no sim Route53 to validate against there is no way to satisfy this,
   * so it is rejected rather than silently issuing certificates anyway.
   */
  alwaysRequireDnsValidation(): void {
    if (this.dnsRecords === undefined) {
      throw new Error(
        "Sim ACM cannot require DNS validation with no sim Route53 to validate against. " +
          "Use SimAws, so ACM can see Hosted Zones, rather than a standalone SimAcm.",
      );
    }

    this.mode = SimAcmDnsValidationMode.always();
  }

  /**
   * Never require a DNS validation record before issuing a Certificate.
   */
  neverRequireDnsValidation(): void {
    this.mode = SimAcmDnsValidationMode.never();
  }

  /**
   * Begin validating a newly requested Certificate.
   */
  begin(certificate: SimAcmCertificate): void {
    this.pendingCertificates.add(certificate);
    this.listenForRecordChanges();
    this.background.schedule(() => this.settle(certificate));
  }

  /**
   * Validate whatever can be validated now, issuing the Certificate once every
   * domain name on it has succeeded.
   */
  async settle(certificate: SimAcmCertificate): Promise<void> {
    for (const domainValidation of certificate.domainValidationOptions) {
      this.validateDomain(domainValidation);
    }

    if (!certificate.isValidated) {
      return;
    }

    await certificate.issue();
    this.pendingCertificates.delete(certificate);
  }

  /**
   * Validate one domain name, if it is waiting and its record now exists.
   */
  private validateDomain(domainValidation: SimAcmDomainValidation): void {
    if (!domainValidation.isPending) {
      return;
    }

    const dnsRecords = this.dnsRecords;
    if (dnsRecords === undefined) {
      domainValidation.succeed();
      return;
    }

    const requiredRecord = this.requiredDnsRecord(domainValidation, dnsRecords);
    if (requiredRecord === undefined) {
      domainValidation.succeed();
      return;
    }

    if (dnsRecords.hasCname(requiredRecord.name, requiredRecord.value)) {
      domainValidation.succeed();
    }
  }

  /**
   * The DNS record a domain name must publish before it can be validated.
   *
   * Undefined means this domain name does not need to prove anything through
   * DNS: it is not using DNS validation, or nothing in the simulation is
   * authoritative for it.
   */
  private requiredDnsRecord(
    domainValidation: SimAcmDomainValidation,
    dnsRecords: SimAcmDnsRecords,
  ): SimAcmValidationRecord | undefined {
    const resourceRecord = domainValidation.resourceRecord;

    if (
      resourceRecord === undefined ||
      domainValidation.validationMethod !== "DNS"
    ) {
      return undefined;
    }

    const requiresValidation = this.mode.requiresValidation(
      dnsRecords.hasAuthorityFor(domainValidation.domainName),
    );

    if (!requiresValidation) {
      return undefined;
    }

    return resourceRecord;
  }

  /**
   * Subscribe to DNS record changes the first time a Certificate needs them.
   */
  private listenForRecordChanges(): void {
    const dnsRecords = this.dnsRecords;

    if (this.listeningForRecordChanges || dnsRecords === undefined) {
      return;
    }

    this.listeningForRecordChanges = true;
    dnsRecords.onRecordChange(() => {
      this.revalidatePendingCertificates();
    });
  }

  /**
   * Schedule another look at every Certificate still waiting to be issued.
   */
  private revalidatePendingCertificates(): void {
    for (const certificate of this.pendingCertificates) {
      this.background.schedule(() => this.settle(certificate));
    }
  }
}
