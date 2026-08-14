import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * The custom domain configuration of a user pool domain, in the shape a
 * request sets it and a described domain reports it.
 */
export interface SimCognitoCustomDomainConfigType {
  readonly CertificateArn?: string | undefined;
  readonly SecurityPolicy?: string | undefined;
}

/**
 * The certificate a custom domain is served with.
 *
 * Nothing here terminates TLS, so the certificate is recorded rather than
 * used. It is still required, as real Cognito requires it: a custom domain
 * created without one is a request that fails on the way to AWS, and a
 * simulation that accepted it would hide that.
 *
 * The certificate is not resolved against simulated ACM. Real Cognito requires
 * one issued in `us-east-1`, whatever region the pool is in, and checking that
 * here would only repeat a rule no request in a test is trying to break.
 */
export class SimCognitoCustomDomainConfig {
  public readonly certificateArn: string;
  public readonly securityPolicy: string | undefined;

  constructor(config: SimCognitoCustomDomainConfigType) {
    if (config.CertificateArn === undefined || config.CertificateArn === "") {
      throw new SimCognitoInvalidParameterException(
        "CustomDomainConfig CertificateArn is required: a custom domain is " +
          "served with a certificate",
      );
    }

    this.certificateArn = config.CertificateArn;
    this.securityPolicy = config.SecurityPolicy;
  }

  /**
   * This configuration as a described domain reports it.
   */
  toOutput(): SimCognitoCustomDomainConfigType {
    return {
      CertificateArn: this.certificateArn,
      ...(this.securityPolicy !== undefined && {
        SecurityPolicy: this.securityPolicy,
      }),
    };
  }
}
