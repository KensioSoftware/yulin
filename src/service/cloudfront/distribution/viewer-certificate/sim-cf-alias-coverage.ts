/**
 * Whether a certificate's domain names cover a CloudFront alternate domain
 * name.
 *
 * CloudFront rejects a Distribution whose alternate domain names are not all
 * covered by its viewer certificate, which is a common way for a Distribution
 * to be rejected at deploy time after looking fine in a template.
 *
 * A wildcard covers exactly one label, matching how AWS treats it: `*.a.test`
 * covers `www.a.test` but neither `a.test` nor `deep.www.a.test`.
 */
export class SimCloudFrontAliasCoverage {
  private readonly certificateDomainNames: readonly string[];

  constructor(certificateDomainNames: readonly string[]) {
    this.certificateDomainNames = certificateDomainNames.map((domainName) =>
      normalizeDomainName(domainName),
    );
  }

  /**
   * The alternate domain names no certificate domain name covers.
   */
  uncovered(aliases: Iterable<string>): readonly string[] {
    return [...aliases].filter((alias) => !this.covers(alias));
  }

  private covers(alias: string): boolean {
    const normalizedAlias = normalizeDomainName(alias);

    return this.certificateDomainNames.some((certificateDomainName) =>
      matches(certificateDomainName, normalizedAlias),
    );
  }
}

function matches(certificateDomainName: string, alias: string): boolean {
  if (certificateDomainName === alias) {
    return true;
  }

  if (!certificateDomainName.startsWith("*.")) {
    return false;
  }

  const wildcardSuffix = certificateDomainName.slice(1);

  if (!alias.endsWith(wildcardSuffix)) {
    return false;
  }

  // The wildcard stands for exactly one label, so what it replaced must not
  // itself contain a dot.
  const wildcardLabel = alias.slice(0, -wildcardSuffix.length);

  return wildcardLabel.length > 0 && !wildcardLabel.includes(".");
}

function normalizeDomainName(domainName: string): string {
  return domainName.toLowerCase().replace(/\.+$/u, "");
}
