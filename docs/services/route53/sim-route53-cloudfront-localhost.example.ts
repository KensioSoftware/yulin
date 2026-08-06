/**
 * Serving a CloudFront distribution through a simulated Route53 hostname.
 */

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const s3 = simAws.s3();
  const cloudFront = simAws.cloudFront();
  const route53 = simAws.route53();

  await s3.createBucket(
    new CreateBucketCommand({
      Bucket: "site-bucket",
    }),
  );

  await s3.putObject(
    new PutObjectCommand({
      Bucket: "site-bucket",
      Key: "index.html",
      Body: "<h1>Hello from a Route53 hostname</h1>",
      ContentType: "text/html; charset=utf-8",
    }),
  );

  const distributionCreation = await cloudFront.createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "route53-site-distribution",
        Comment: "Route53 local site distribution",
        Enabled: true,
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "site-origin",
              DomainName: "site-bucket.s3.amazonaws.com",
              S3OriginConfig: {
                OriginAccessIdentity: "",
              },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
        },
      },
    }),
  );

  const distributionHostname = distributionCreation.Distribution!.DomainName!;

  const hostedZoneCreation = await route53.createHostedZone(
    new CreateHostedZoneCommand({
      Name: "example.test",
      CallerReference: "route53-localhost-zone",
    }),
  );

  const hostedZoneId = hostedZoneCreation.HostedZone!.Id!;

  await route53.changeResourceRecordSets(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: "www.example.test",
              Type: "CNAME",
              TTL: 300,
              ResourceRecords: [{ Value: distributionHostname }],
            },
          },
        ],
      },
    }),
  );

  await simAws.backgroundTasksComplete();

  const response = await fetch(
    `http://www.example.test.sim-aws.localhost:${srv.port}/`,
  );

  console.log(response.status);
  console.log(await response.text());
} finally {
  await srv.close();
}
