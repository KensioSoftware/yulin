import type { SimElbV2Certificate } from "../../command/sim-elbv2-shared.command.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";

/**
 * Reading the ARNs out of the certificate references a request carries.
 *
 * Four operations take the same `Certificates` list and all any of them wants
 * from it is the ARNs, so taking it apart lives here rather than in each of
 * them.
 */

/**
 * Read the ARN one certificate reference names.
 */
export function simElbV2CertificateArn(
  certificate: SimElbV2Certificate,
  field: string,
): string {
  const arn = certificate.CertificateArn;

  if (arn === undefined) {
    throw new SimElbV2ValidationError(`${field} requires a CertificateArn`);
  }

  return arn;
}

/**
 * Read the ARNs a request naming certificates carries, refusing one that names
 * none.
 *
 * This is for the operations a certificate list is the whole subject of. A
 * listener create naming no certificate is a different thing, since an HTTP
 * listener has no use for one.
 */
export function simElbV2CertificateArns(
  certificates: readonly SimElbV2Certificate[] | undefined,
  field: string,
): readonly string[] {
  if (certificates === undefined || certificates.length === 0) {
    throw new SimElbV2ValidationError(
      `${field} requires at least one certificate`,
    );
  }

  return certificates.map((certificate) =>
    simElbV2CertificateArn(certificate, field),
  );
}
