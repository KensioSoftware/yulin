/**
 * Reading configuration into a template through a Parameter Store value type.
 */

import { PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.ssm().putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/uploads-bucket",
    Type: "String",
    Value: "myapp-prod-uploads",
  }),
);

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "app-stack",
  template: {
    Parameters: {
      UploadsBucketName: {
        Type: "AWS::SSM::Parameter::Value<String>",
        Default: "/myapp/prod/uploads-bucket",
      },
    },
    Resources: {
      UploadsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: { Ref: "UploadsBucketName" } },
      },
    },
  },
});

await stack.waitForDeployComplete();

// The Bucket was created under the name the parameter holds.
console.log(simAws.s3().getSimBucketByName("myapp-prod-uploads")?.bucketName);
// "myapp-prod-uploads"
