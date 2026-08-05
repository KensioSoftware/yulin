/**
 * Applying a changed template with UpdateStackCommand.
 */

import {
  CreateStackCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

const siteBucket = {
  Type: "AWS::S3::Bucket",
  Properties: { BucketName: "site-content" },
};

const deployedTemplate = JSON.stringify({
  Resources: { SiteBucket: siteBucket },
});

const changedTemplate = JSON.stringify({
  Resources: {
    SiteBucket: siteBucket,
    UploadsBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "site-uploads" },
    },
  },
});

await simCfn.createStack(
  new CreateStackCommand({
    StackName: "site",
    TemplateBody: deployedTemplate,
  }),
);
await simCfn.waitForStackDeployComplete("site");

await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "site-content",
    Key: "index.html",
    Body: "<h1>Hello</h1>",
  }),
);

// Apply the changed template to the stack that is already there.
await simCfn.updateStack(
  new UpdateStackCommand({
    StackName: "site",
    TemplateBody: changedTemplate,
  }),
);
await simCfn.waitForStackUpdateComplete("site");

// The bucket the new template adds is in simulated S3.
console.log(simAws.s3().getSimBucketByName("site-uploads"));

// And the bucket the template did not change still holds its object.
const page = await simAws
  .s3()
  .getObject(
    new GetObjectCommand({ Bucket: "site-content", Key: "index.html" }),
  );
console.log(page.Body);
