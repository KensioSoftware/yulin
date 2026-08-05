/**
 * Disabling a simulated CloudFront Distribution and then deleting it.
 */

import {
  CreateDistributionCommand,
  DeleteDistributionCommand,
  type DistributionConfig,
  GetDistributionCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCloudFront = simAws.cloudFront();

await simAws
  .s3()
  .createBucket(new CreateBucketCommand({ Bucket: "site-bucket" }));

const distributionConfig: DistributionConfig = {
  CallerReference: "site-distribution",
  Comment: "Site distribution",
  Enabled: true,
  Origins: {
    Quantity: 1,
    Items: [
      {
        Id: "site-origin",
        DomainName: "site-bucket.s3.amazonaws.com",
        S3OriginConfig: { OriginAccessIdentity: "" },
      },
    ],
  },
  DefaultCacheBehavior: {
    TargetOriginId: "site-origin",
    ViewerProtocolPolicy: "allow-all",
  },
};

const created = await simCloudFront.createDistribution(
  new CreateDistributionCommand({ DistributionConfig: distributionConfig }),
);
await simAws.backgroundTasksComplete();

const distributionId = created.Distribution?.Id;

try {
  await simCloudFront.deleteDistribution(
    new DeleteDistributionCommand({ Id: distributionId }),
  );
} catch (error) {
  // DistributionNotDisabled: Sim CloudFront Distribution ... is enabled, so it
  // cannot be deleted. Disable it with UpdateDistribution first.
  console.log((error as Error).message);
}

// Disable the Distribution, then delete it.
await simCloudFront.updateDistribution(
  new UpdateDistributionCommand({
    Id: distributionId,
    DistributionConfig: { ...distributionConfig, Enabled: false },
  }),
);
await simAws.backgroundTasksComplete();

await simCloudFront.deleteDistribution(
  new DeleteDistributionCommand({ Id: distributionId }),
);

try {
  await simCloudFront.getDistribution(
    new GetDistributionCommand({ Id: distributionId }),
  );
} catch (error) {
  // NoSuchDistribution: No sim CloudFront Distribution with ID ...
  console.log((error as Error).message);
}
