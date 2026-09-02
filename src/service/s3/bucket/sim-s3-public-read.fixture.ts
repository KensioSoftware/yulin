import type { SimS3 } from "../sim-s3.js";

/**
 * Make a Bucket's Objects publicly readable, as a Bucket served to the public
 * must be.
 *
 * A static website Bucket needs this, and so does a Bucket behind a CloudFront
 * Origin with no origin access control: both are read by something holding no
 * credentials, so the Bucket policy is the only thing that can allow the read.
 *
 * Real S3 serves such a read only what the Bucket policy has made readable, and
 * blocks a public Bucket policy on a new Bucket, so it takes both steps. This
 * issues exactly the two commands a real deployment issues rather than reaching
 * around them, so a test using it exercises the same path a user's own setup
 * would.
 *
 * The policy grants listing alongside the read. Real S3 admits that a key is
 * missing only to a reader holding `s3:ListBucket`, and answers 403 to a
 * reader holding the Object read alone. A site with its own error document, a
 * folder redirect or a custom 404 error response grants both permissions for
 * that reason.
 */
export async function grantPublicObjectRead(
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
        Statement: [
          {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: `arn:aws:s3:::${bucketName}/*`,
          },
          {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:ListBucket",
            Resource: `arn:aws:s3:::${bucketName}`,
          },
        ],
      }),
    },
  });
}
