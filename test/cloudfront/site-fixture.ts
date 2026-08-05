/**
 * A simulated static site behind a CloudFront Distribution, which every test
 * about serving one needs before it can say anything about the response.
 *
 * This lives under `test/` for the same reasons as `test/sqs/`: eslint rejects
 * an AWS SDK import from `src/` outside a test file, and `test/**` is
 * type-checked with everything else, excluded from the published build, not
 * collected as a suite, and not counted in coverage.
 */

import { assertNonNullable } from "@kensio/smartass";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  CreateDistributionCommand,
  type DistributionConfig,
} from "@aws-sdk/client-cloudfront";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { SimCloudFrontServiceController } from "../../src/service/cloudfront/controller/sim-cloudfront-controller.js";
import { SimAwsServiceRequest } from "../../src/serve/controller/sim-service-controller.js";

/**
 * Create a Bucket holding the given objects, keyed by object key.
 */
export async function simCfSiteBucket(
  simAws: SimAws,
  bucketName: string,
  objects: Record<string, string>,
): Promise<void> {
  const simS3 = simAws.s3();
  await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

  await Promise.all(
    Object.entries(objects).map(
      async ([key, body]) =>
        await simS3.putObject(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            ContentType: "text/html",
            Body: body,
          }),
        ),
    ),
  );
}

/**
 * A DistributionConfig serving one S3 Origin, with the given config merged on
 * top so a test only states the part it is about.
 */
export function simCfSiteDistributionConfig(
  bucketName: string,
  distributionConfig: Partial<DistributionConfig> = {},
): DistributionConfig {
  return {
    CallerReference: `site-${bucketName}`,
    Comment: "Static site distribution",
    Enabled: true,
    Origins: {
      Quantity: 1,
      Items: [
        {
          Id: "site-origin",
          DomainName: `${bucketName}.s3.amazonaws.com`,
          S3OriginConfig: { OriginAccessIdentity: "" },
        },
      ],
    },
    DefaultCacheBehavior: {
      TargetOriginId: "site-origin",
      ViewerProtocolPolicy: "allow-all",
    },
    ...distributionConfig,
  };
}

/**
 * Create the Distribution and return its ID.
 */
export async function simCfSiteDistributionId(
  simAws: SimAws,
  distributionConfig: DistributionConfig,
): Promise<string> {
  const creation = await simAws
    .cloudFront()
    .createDistribution(
      new CreateDistributionCommand({ DistributionConfig: distributionConfig }),
    );

  assertNonNullable(creation.Distribution?.Id);

  return creation.Distribution.Id;
}

/**
 * Serve one request to a Distribution through the CloudFront controller.
 */
export async function simCfSiteRequest(
  simAws: SimAws,
  distributionId: string,
  path: string,
  requestInit: RequestInit = {},
): Promise<Response> {
  const controller = new SimCloudFrontServiceController({ simAws });

  return await controller.handleRequest(
    new SimAwsServiceRequest({
      target: { service: "cloudFront", resourceName: "" },
      request: new Request(
        `http://${distributionId}.cloudfront.net.sim-aws.localhost${path}`,
        requestInit,
      ),
    }),
  );
}
