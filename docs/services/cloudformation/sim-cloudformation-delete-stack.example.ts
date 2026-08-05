/**
 * Deleting a simulated CloudFormation Stack with DeleteStackCommand.
 */

import {
  CreateStackCommand,
  DeleteStackCommand,
} from "@aws-sdk/client-cloudformation";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

const templateBody = JSON.stringify({
  Resources: {
    SiteBucket: {
      Type: "AWS::S3::Bucket",
      Properties: {
        BucketName: "deletable-stack-bucket",
      },
    },
  },
});

await simCfn.createStack(
  new CreateStackCommand({
    StackName: "deletable-stack",
    TemplateBody: templateBody,
  }),
);
await simCfn.waitForStackDeployComplete("deletable-stack");

await simCfn.deleteStack(
  new DeleteStackCommand({ StackName: "deletable-stack" }),
);
await simCfn.waitForStackDeleteComplete("deletable-stack");

// The Bucket has gone from simulated S3.
console.log(simAws.s3().getSimBucketByName("deletable-stack-bucket"));

// And the Stack name is free, so the same Stack can be deployed again.
await simCfn.createStack(
  new CreateStackCommand({
    StackName: "deletable-stack",
    TemplateBody: templateBody,
  }),
);
await simCfn.waitForStackDeployComplete("deletable-stack");
