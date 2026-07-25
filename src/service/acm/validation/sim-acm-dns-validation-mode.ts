type SimAcmDnsValidationModeName = "always" | "auto" | "never";

/**
 * When sim ACM requires a DNS validation record before issuing a Certificate.
 *
 * The default is `auto`, which requires validation only for domain names the
 * simulation actually holds DNS authority for. That keeps sim ACM realistic
 * for users who are simulating Route53, without obstructing users whose DNS
 * lives outside the simulation entirely.
 */
export class SimAcmDnsValidationMode {
  private constructor(private readonly name: SimAcmDnsValidationModeName) {}

  /**
   * Require validation only where a Hosted Zone covers the domain name.
   */
  static auto(): SimAcmDnsValidationMode {
    return new SimAcmDnsValidationMode("auto");
  }

  /**
   * Always require validation, whether or not a Hosted Zone covers the domain.
   */
  static always(): SimAcmDnsValidationMode {
    return new SimAcmDnsValidationMode("always");
  }

  /**
   * Never require validation.
   */
  static never(): SimAcmDnsValidationMode {
    return new SimAcmDnsValidationMode("never");
  }

  /**
   * Whether a domain name needs its DNS validation record before the
   * Certificate can be issued.
   */
  requiresValidation(hasDnsAuthority: boolean): boolean {
    switch (this.name) {
      case "always": {
        return true;
      }
      case "never": {
        return false;
      }
      case "auto": {
        return hasDnsAuthority;
      }
    }
  }
}
