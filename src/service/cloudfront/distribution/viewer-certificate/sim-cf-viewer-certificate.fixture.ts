import { assertNonNullable } from "@kensio/smartass";

import type { SimAws } from "../../../aws/sim-aws.js";
import type { AwsRegionName } from "../../../aws/sim-aws-region.js";

/**
 * Request a Certificate and return its ARN once it is issued.
 *
 * Certificates issue on their own where no Hosted Zone covers the domain, so
 * this is an issued Certificate unless the caller has created one.
 */
export async function issuedCertificateArn(
  simAws: SimAws,
  domainName: string,
  regionName: AwsRegionName = "us-east-1",
  subjectAlternativeNames: readonly string[] = [],
): Promise<string> {
  const output = await simAws
    .region(regionName)
    .acm()
    .requestCertificate({
      input: {
        DomainName: domainName,
        SubjectAlternativeNames: subjectAlternativeNames,
      },
    });

  await simAws.backgroundTasksComplete();
  assertNonNullable(output.CertificateArn);

  return output.CertificateArn;
}
