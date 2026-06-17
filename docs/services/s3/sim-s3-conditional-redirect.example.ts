/**
 * Conditional redirects in simulated S3.
 */

import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "docs-site",
  }),
);

await simS3.putBucketWebsite(
  new PutBucketWebsiteCommand({
    Bucket: "docs-site",
    WebsiteConfiguration: {
      IndexDocument: {
        Suffix: "index.html",
      },
      RoutingRules: [
        {
          Condition: {
            KeyPrefixEquals: "old/",
          },
          Redirect: {
            ReplaceKeyPrefixWith: "new/",
          },
        },
        {
          Condition: {
            HttpErrorCodeReturnedEquals: "404",
          },
          Redirect: {
            HttpRedirectCode: "302",
            ReplaceKeyWith: "not-found.html",
          },
        },
      ],
    },
  }),
);
