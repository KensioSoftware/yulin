import { afterAll, beforeAll, describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { installSimS3 } from "../../s3/index.js";
import { SimAwsLocalServer } from "../../../serve/index.js";
import { installSimCloudFront } from "../install/install-sim-cloudfront.js";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";

describe("sim CloudFront local server", () => {
  const simAws = new SimAws();
  installSimS3(simAws);
  installSimCloudFront(simAws);
  const srv: SimAwsLocalServer = new SimAwsLocalServer(simAws);

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(() => {
    srv.close();
  });

  it("serves from multiple sim S3 Origins", async () => {
    const simS3 = simAws.service("s3");
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" }));
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-b" }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "bucket-a",
        Key: "assets/foo/object.json",
        Body: JSON.stringify({ something: "foo-A" }),
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "bucket-a",
        Key: "assets/object.json",
        Body: JSON.stringify({ something: "A" }),
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "bucket-b",
        Key: "public/assets/foo/object.json",
        Body: JSON.stringify({ something: "foo-B" }),
      }),
    );

    const simCloudFront = simAws.service("cloudFront");
    const createDistroOutput = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "default-behavior",
          Comment: "Foobar CDN",
          Enabled: true,
          Origins: {
            Quantity: 2,
            Items: [
              {
                Id: "origin-a",
                DomainName: "bucket-a.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
              {
                Id: "origin-b",
                DomainName: "bucket-b.s3.amazonaws.com",
                OriginPath: "/public",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
          },
          CacheBehaviors: {
            Quantity: 2,
            Items: [
              {
                PathPattern: "/assets/*",
                TargetOriginId: "origin-a",
                ViewerProtocolPolicy: "allow-all",
              },
              {
                PathPattern: "/assets/foo/*",
                TargetOriginId: "origin-b",
                ViewerProtocolPolicy: "allow-all",
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "origin-a",
            ViewerProtocolPolicy: "allow-all",
          },
        },
      }),
    );
    const distributionId = createDistroOutput.Distribution?.Id;
    assertNonNullable(distributionId);

    const assetsRes = await fetch(
      `http://${distributionId.toLowerCase()}.cloudfront.net.sim-aws.localhost:${srv.port}/assets/object.json`,
    );
    assertIdentical(assetsRes.status, 200);
    assertIdentical(await assetsRes.text(), '{"something":"A"}');

    const assetsFooRes = await fetch(
      `http://${distributionId.toLowerCase()}.cloudfront.net.sim-aws.localhost:${srv.port}/assets/foo/object.json`,
    );
    assertIdentical(assetsFooRes.status, 200);
    assertIdentical(await assetsFooRes.text(), '{"something":"foo-B"}');

    const missingRes = await fetch(
      `http://${distributionId.toLowerCase()}.cloudfront.net.sim-aws.localhost:${srv.port}/missing/object.json`,
    );
    assertIdentical(missingRes.status, 404);
  });
});
