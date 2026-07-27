import type { SimS3 } from "../../sim-s3.js";

/**
 * Make a Bucket's Objects publicly readable, as a static website Bucket must
 * be.
 *
 * Real S3 serves a website endpoint only what the Bucket policy has made
 * readable, and blocks a public Bucket policy on a new Bucket, so a website
 * needs both steps. This issues exactly the two commands a real deployment
 * issues rather than reaching around them, so a test using it exercises the
 * same path a user's own setup would.
 */
export async function grantPublicWebsiteRead(
  simS3: SimS3,
  bucketName: string,
): Promise<void> {
  await simS3.putPublicAccessBlock({
    input: {
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
      },
    },
  });

  await simS3.putBucketPolicy({
    input: {
      Bucket: bucketName,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: `arn:aws:s3:::${bucketName}/*`,
        },
      }),
    },
  });
}
