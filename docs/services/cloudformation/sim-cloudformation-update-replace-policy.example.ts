/**
 * Keeping a Resource an update replaces.
 */

import {
  CreateStackCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

function reportsTemplate(bucketName: string): string {
  return JSON.stringify({
    Resources: {
      ReportsBucket: {
        Type: "AWS::S3::Bucket",
        UpdateReplacePolicy: "Retain",
        Properties: { BucketName: bucketName },
      },
    },
  });
}

await simCfn.createStack(
  new CreateStackCommand({
    StackName: "reports",
    TemplateBody: reportsTemplate("reports-2025"),
  }),
);
await simCfn.waitForStackDeployComplete("reports");

// Renaming the bucket replaces it.
await simCfn.updateStack(
  new UpdateStackCommand({
    StackName: "reports",
    TemplateBody: reportsTemplate("reports-2026"),
  }),
);
await simCfn.waitForStackUpdateComplete("reports");

// The bucket the update replaced is still in simulated S3.
console.log(simAws.s3().getSimBucketByName("reports-2025"));

// And so is the one created in its place.
console.log(simAws.s3().getSimBucketByName("reports-2026"));

// The stack reports what it kept.
const stack = simCfn.getStackByName("reports");
console.log(stack?.retainedResources.map((resource) => resource.logicalId));
