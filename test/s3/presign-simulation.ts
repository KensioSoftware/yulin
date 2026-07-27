/**
 * Sets up a simulation whose S3 Objects can be reached with presigned URLs
 * built by the real AWS SDK presigner.
 *
 * This lives under `test/` because several test files share it, and a module
 * that both exports helpers and declares tests is not allowed. It is
 * deliberately built out of the real SDK: the point of these tests is that the
 * tooling users actually run produces URLs simulated S3 accepts, which a
 * simulator-made URL could never prove.
 */

import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { SimAws } from "../../src/index.js";
import type { AwsRegionName } from "../../src/service/aws/sim-aws-region.js";
import { SimAwsHttp } from "../../src/serve/http/sim-aws-http.js";

export const presignBucketName = "reports";
export const presignObjectKey = "q3/report.pdf";
export const presignObjectBody = "quarterly numbers";
export const presignRegionName = "eu-west-2" as AwsRegionName;

export interface PresignCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export interface PresignSimulation {
  readonly simAws: SimAws;
  readonly http: SimAwsHttp;
  /**
   * An S3 client pointed at simulated S3, signing as a principal allowed to
   * read and write Objects in the Bucket.
   */
  readonly client: S3Client;
  readonly credentials: PresignCredentials;
  readonly userArn: string;
}

interface PresignClientProperties {
  /**
   * The endpoint the client signs for, which has to be the one the URL will
   * actually be fetched at: a presigned URL signs its host, port included, so
   * a URL signed for a portless endpoint cannot be redirected to a local
   * server afterwards.
   */
  readonly endpoint: string | URL;
  readonly credentials: PresignCredentials;
  readonly requestChecksumCalculation?: "WHEN_REQUIRED" | "WHEN_SUPPORTED";
  readonly forcePathStyle?: boolean;
}

/**
 * An S3 client that presigns for one simulated S3 endpoint.
 */
export function presignClient(properties: PresignClientProperties): S3Client {
  const {
    endpoint,
    credentials,
    requestChecksumCalculation = "WHEN_REQUIRED",
    forcePathStyle = false,
  } = properties;

  return new S3Client({
    region: presignRegionName,
    endpoint: endpoint.toString(),
    requestChecksumCalculation,
    forcePathStyle,
    credentials,
  });
}

interface PresignSimulationProperties {
  /**
   * What the signing user is allowed to do, defaulting to reading and writing
   * Objects in the Bucket.
   */
  readonly allowedActions?: string[];
  /**
   * Passed to the S3 client, so a test can build URLs the way a client with a
   * different checksum setting would.
   */
  readonly requestChecksumCalculation?: "WHEN_REQUIRED" | "WHEN_SUPPORTED";
  /**
   * Whether the client addresses the Bucket in the path rather than the
   * hostname, as it does for itself when a Bucket name contains dots.
   */
  readonly forcePathStyle?: boolean;
}

/**
 * A simulation holding one Bucket, one Object, and a user who can presign for
 * them.
 */
export async function presignSimulation(
  properties: PresignSimulationProperties = {},
): Promise<PresignSimulation> {
  const {
    allowedActions = ["s3:GetObject", "s3:PutObject"],
    requestChecksumCalculation = "WHEN_REQUIRED",
    forcePathStyle = false,
  } = properties;

  const simAws = new SimAws({ defaultRegionName: presignRegionName });
  const simS3 = simAws.s3();
  const simIam = simAws.iam();

  await simS3.createBucket(
    new CreateBucketCommand({ Bucket: presignBucketName }),
  );
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: presignBucketName,
      Key: presignObjectKey,
      Body: presignObjectBody,
      ContentType: "application/pdf",
    }),
  );

  const user = await simIam.createUser(
    new CreateUserCommand({ UserName: "Presigner" }),
  );
  await simIam.putUserPolicy(
    new PutUserPolicyCommand({
      UserName: "Presigner",
      PolicyName: "PresignedObjectAccess",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: allowedActions,
          Resource: `arn:aws:s3:::${presignBucketName}/*`,
        },
      }),
    }),
  );
  const accessKey = await simIam.createAccessKey(
    new CreateAccessKeyCommand({ UserName: "Presigner" }),
  );

  const credentials = {
    accessKeyId: accessKey.AccessKey.AccessKeyId,
    secretAccessKey: accessKey.AccessKey.SecretAccessKey,
  };

  return {
    simAws,
    http: new SimAwsHttp({ simAws }),
    client: presignClient({
      endpoint: simS3.getServiceUrl(),
      credentials,
      requestChecksumCalculation,
      forcePathStyle,
    }),
    credentials,
    userArn: user.User.Arn,
  };
}
