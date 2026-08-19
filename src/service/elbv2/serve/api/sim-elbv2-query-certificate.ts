import type { SimQueryFields } from "../../../../serve/http/api/query/sim-query-request.js";
import type { SimQueryOutput } from "../../../../serve/http/api/query/sim-query-result.js";
import {
  queryList,
  queryMembers,
} from "../../../../serve/http/api/query/sim-query-result.js";

/**
 * Read the certificates a request names.
 *
 * A listener takes them when it is created or changed, and the listener
 * certificate operations add and remove them one request at a time.
 */
export function elbV2QueryCertificates(
  fields: SimQueryFields,
): readonly Record<string, unknown>[] | undefined {
  return fields.list("Certificates", (certificate) => ({
    CertificateArn: certificate.text("CertificateArn"),
    IsDefault: certificate.flag("IsDefault"),
  }));
}

/**
 * Write the certificates an operation answered with.
 */
export function elbV2QueryCertificateList(output: SimQueryOutput): string {
  return queryList(output, "Certificates", (certificate) =>
    queryMembers(certificate, ["CertificateArn", "IsDefault"]),
  );
}
