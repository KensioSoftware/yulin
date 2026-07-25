export type SimAcmDnsRecordChangeListener = () => void;

/**
 * DNS records visible to simulated ACM when validating domain ownership.
 *
 * Real ACM proves domain ownership by looking for a CNAME in public DNS. This
 * port is how sim ACM does the same against sim Route53 without depending on
 * Route53's own types or name normalisation rules. A standalone SimAcm has no
 * implementation of this at all, which is what makes it issue certificates
 * without validating them.
 */
export interface SimAcmDnsRecords {
  /**
   * Whether the simulation holds DNS authority for a domain name.
   *
   * This is the signal sim ACM uses to decide whether a certificate should
   * wait for validation: with no Hosted Zone covering the domain name there is
   * nothing in the simulation that could answer for it.
   */
  hasAuthorityFor(domainName: string): boolean;

  /**
   * Whether a CNAME record with this name and value exists.
   */
  hasCname(name: string, value: string): boolean;

  /**
   * Create a CNAME record in the Hosted Zone covering its name.
   *
   * Returns false when no Hosted Zone covers the name, so the caller can
   * report which records it could not create.
   */
  createCname(name: string, value: string): boolean;

  /**
   * Register a listener called whenever any DNS record changes.
   */
  onRecordChange(listener: SimAcmDnsRecordChangeListener): void;
}
