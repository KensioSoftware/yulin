import type { SimElbV2Certificate } from "../command/sim-elbv2-shared.command.js";
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
 * Refuse an HTTPS listener with no certificate.
 *
 * One could not complete a handshake, so real ELB refuses to create it and so
 * does this.
 */
export function requireSimElbV2ListenerCertificate(
  protocol: string,
  certificates: readonly SimElbV2Certificate[],
): void {
  if (protocol === "HTTPS" && certificates.length === 0) {
    throw new SimElbV2InvalidConfigurationRequestException(
      "An HTTPS listener requires at least one certificate",
    );
  }
}
