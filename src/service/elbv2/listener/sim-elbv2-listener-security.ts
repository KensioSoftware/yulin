import { SimElbV2InvalidConfigurationRequestException } from "../error/sim-elbv2.error.js";

/**
 * The security policy real ELB gives an HTTPS listener that names none.
 */
const defaultSslPolicy = "ELBSecurityPolicy-2016-08";

/**
 * What a listener's protocol decides about its TLS settings.
 *
 * Both rules here are about the same thing, that HTTPS needs what HTTP does
 * not, and both are asked on a create and again on a modify, so they live
 * beside each other rather than inside the listener.
 */

/**
 * The security policy a listener holds, which is none unless it is HTTPS.
 *
 * The policy is held and reported and nothing acts on it, since no handshake
 * is performed here for it to decide anything about.
 */
export function simElbV2ListenerSslPolicy(
  protocol: string,
  sslPolicy: string | undefined,
): string | undefined {
  if (protocol !== "HTTPS") {
    return undefined;
  }

  return sslPolicy ?? defaultSslPolicy;
}

/**
 * The default certificate a listener holds, which is none unless it is HTTPS.
 *
 * An HTTPS listener with no certificate could not complete a handshake, so real
 * ELB refuses to create one and so does this. A listener that is not HTTPS
 * holds no certificate, so moving one to HTTP drops the certificates it was
 * carrying rather than keeping ones nothing would present.
 */
export function simElbV2ListenerCertificate(
  protocol: string,
  defaultCertificateArn: string | undefined,
): string | undefined {
  if (protocol !== "HTTPS") {
    return undefined;
  }

  if (defaultCertificateArn === undefined) {
    throw new SimElbV2InvalidConfigurationRequestException(
      "An HTTPS listener requires at least one certificate",
    );
  }

  return defaultCertificateArn;
}

/**
 * Refuse a certificate on a listener that speaks no TLS.
 *
 * Real ELB has nothing for an HTTP listener to do with a certificate, so it
 * refuses one rather than holding it, and a listener that looks configured for
 * HTTPS while answering plain HTTP is exactly the state worth refusing.
 */
export function requireSimElbV2CertificateProtocol(protocol: string): void {
  if (protocol !== "HTTPS") {
    throw new SimElbV2InvalidConfigurationRequestException(
      `Certificates go on an HTTPS listener, and this one speaks ${protocol}`,
    );
  }
}
