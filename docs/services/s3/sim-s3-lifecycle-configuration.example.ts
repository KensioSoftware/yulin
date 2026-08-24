import {
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simAws.cloudFormation().deployTemplate({
  stackName: "logs-stack",
  template: {
    Resources: {
      LogBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "logs",
          LifecycleConfiguration: {
            Rules: [
              {
                Id: "expire-raw-logs",
                Status: "Enabled",
                Prefix: "raw/",
                ExpirationInDays: 365,
              },
            ],
          },
        },
      },
    },
  },
});

// The template's rule reads back off the deployed Bucket, in the shape the SDK
// states one in.
const deployed = await simS3.getBucketLifecycleConfiguration(
  new GetBucketLifecycleConfigurationCommand({ Bucket: "logs" }),
);

console.log(deployed.Rules);

// A put replaces the whole configuration, so a rule it leaves out is gone.
await simS3.putBucketLifecycleConfiguration(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: "logs",
    LifecycleConfiguration: {
      Rules: [
        {
          ID: "abort-incomplete-uploads",
          Status: "Enabled",
          Filter: { Prefix: "" },
          AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
        },
      ],
    },
  }),
);
