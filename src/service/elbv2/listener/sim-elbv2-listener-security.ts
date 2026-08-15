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
 * What a request names about a listener's default certificate, and what the
 * listener already held.
 */
export interface SimElbV2ListenerCertificateChoice {
  readonly protocol: string;
  /** The certificate this request named, if it named one. */
  readonly requested: string | undefined;
  /** The certificate the listener already had, on a modify. */
  readonly held?: string | undefined;
}

/**
 * The default certificate a listener holds, which is none unless it is HTTPS.
 *
 * An HTTPS listener with no certificate could not complete a handshake, so real
 * ELB refuses to create one and so does this. A request naming a certificate
 * for a listener that speaks no TLS is refused for the other half of the same
 * reason.
 *
 * What the request named and what the listener already had are separate,
 * because the two lead to different answers on the same protocol: a listener
 * moved to HTTP drops the certificate it was carrying, where a request that
 * moves it to HTTP and names a certificate in the same breath contradicts
 * itself and is refused.
 */
export function simElbV2ListenerCertificate(
  choice: SimElbV2ListenerCertificateChoice,
): string | undefined {
  if (choice.requested !== undefined) {
    requireSimElbV2CertificateProtocol(choice.protocol);
  }

  if (choice.protocol !== "HTTPS") {
    return undefined;
  }

  const certificateArn = choice.requested ?? choice.held;

  if (certificateArn === undefined) {
    throw new SimElbV2InvalidConfigurationRequestException(
      "An HTTPS listener requires at least one certificate",
    );
  }

  return certificateArn;
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
