/**
 * Resolve a simulated S3 Bucket name from a CloudFront S3 Origin domain name.
 */
export function bucketNameFromCfS3OriginDomainName(
  originDomainName: string,
): string {
  const bucketName = bucketNameFromOriginDomainName(originDomainName);

  if (bucketName === undefined || bucketName === "") {
    throw new Error(
      `Unable to resolve S3 bucket name from CloudFront origin domain name: ${originDomainName}`,
    );
  }

  return bucketName;
}

function bucketNameFromOriginDomainName(
  originDomainName: string,
): string | undefined {
  const s3DomainSuffixes = [".s3.amazonaws.com", ".s3.dualstack.amazonaws.com"];

  for (const suffix of s3DomainSuffixes) {
    if (originDomainName.endsWith(suffix)) {
      return originDomainName.slice(0, -suffix.length);
    }
  }

  const regionalS3DomainMatch =
    /^(?<bucketName>.+)\.s3[.-][a-z0-9-]+\.amazonaws\.com$/u.exec(
      originDomainName,
    );

  return regionalS3DomainMatch?.groups?.["bucketName"] ?? originDomainName;
}
