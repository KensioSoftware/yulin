/**
 * Catching an Origin a Distribution declares twice.
 */

import {
  CreateDistributionCommand,
  type Origin,
} from "@aws-sdk/client-cloudfront";

import { SimAws } from "@kensio/yulin";

const simCloudFront = new SimAws().cloudFront();

// The two Behaviors below were written by copying one of them, so the second
// Origin says everything the first one says.
const apiOrigin = (originId: string): Origin => ({
  Id: originId,
  DomainName: "api.example.test",
  CustomOriginConfig: {
    HTTPPort: 80,
    HTTPSPort: 443,
    OriginProtocolPolicy: "https-only",
  },
  CustomHeaders: {
    Quantity: 1,
    Items: [
      {
        HeaderName: "x-origin-secret",
        HeaderValue: "5d6e2b0c6f564c1e9d5b2f1a5b8c9d70",
      },
    ],
  },
});

const creation = await simCloudFront.createDistribution(
  new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: "user-site",
      Comment: "User API CDN",
      Enabled: true,
      Origins: {
        Quantity: 2,
        Items: [apiOrigin("live-origin"), apiOrigin("preview-origin")],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "live-origin",
        ViewerProtocolPolicy: "allow-all",
      },
      CacheBehaviors: {
        Quantity: 1,
        Items: [
          {
            PathPattern: "/preview/*",
            TargetOriginId: "preview-origin",
            ViewerProtocolPolicy: "allow-all",
          },
        ],
      },
    },
  }),
);

const distribution = simCloudFront.getSimDistributionById(
  creation.Distribution!.Id!,
);

// [
//   {
//     originId: "preview-origin",
//     repeatsOriginId: "live-origin",
//     domainName: "api.example.test",
//   },
// ]
console.log(distribution?.redundantOrigins);
