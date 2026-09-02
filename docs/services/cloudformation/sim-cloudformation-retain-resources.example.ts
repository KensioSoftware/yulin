/**
 * Keeping named Resources when a Stack is deleted.
 */

import {
  CreateStackCommand,
  DeleteStackCommand,
} from "@aws-sdk/client-cloudformation";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

await simCfn.createStack(
  new CreateStackCommand({
    StackName: "reports-stack",
    TemplateBody: JSON.stringify({
      Resources: {
        ReportsBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "reports" },
        },
        ArchiveBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "archive" },
        },
      },
    }),
  }),
);
await simCfn.waitForStackDeployComplete("reports-stack");

await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "reports",
    Key: "january.csv",
    Body: "reported",
  }),
);

await simCfn.deleteStack(
  new DeleteStackCommand({
    StackName: "reports-stack",
    RetainResources: ["ReportsBucket"],
  }),
);
await simCfn.waitForStackDeleteComplete("reports-stack");

// The named bucket is still in simulated S3, with the object it held.
console.log(simAws.s3().getSimBucketByName("reports"));

// The bucket the call did not name has gone.
console.log(simAws.s3().getSimBucketByName("archive"));
