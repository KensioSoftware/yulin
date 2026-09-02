/**
 * Rolling a failed stack update back to the deployed template.
 */

import {
  CreateStackCommand,
  DescribeStacksCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

await simCfn.createStack(
  new CreateStackCommand({
    StackName: "reports",
    TemplateBody: JSON.stringify({
      Resources: {
        ReportsBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "reports-2025" },
        },
      },
    }),
  }),
);
await simCfn.waitForStackDeployComplete("reports");

// This update renames the bucket and asks for one S3 will not create.
await simCfn.updateStack(
  new UpdateStackCommand({
    StackName: "reports",
    TemplateBody: JSON.stringify({
      Resources: {
        ReportsBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "reports-2026" },
        },
        ArchiveBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "Invalid_Bucket_Name" },
        },
      },
    }),
  }),
);

try {
  await simCfn.waitForStackUpdateComplete("reports");
} catch (error) {
  console.error("Stack update failed", error);
}

const described = await simCfn.describeStacks(
  new DescribeStacksCommand({ StackName: "reports" }),
);

console.log(described.Stacks?.[0]?.StackStatus);
// "UPDATE_ROLLBACK_COMPLETE"

// The bucket the deployed template describes is back in simulated S3.
console.log(simAws.s3().getSimBucketByName("reports-2025"));
