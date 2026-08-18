/**
 * Sharing a value between two simulated CloudFormation Stacks.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cloudFormation = simAws.cloudFormation();

await cloudFormation.deployTemplate({
  stackName: "producer-stack",
  template: {
    Resources: {
      Uploads: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "shared-uploads" },
      },
    },
    Outputs: {
      UploadsBucket: {
        Value: { Ref: "Uploads" },
        Export: { Name: "producer-stack:UploadsBucket" },
      },
    },
  },
});

const consumer = await cloudFormation.deployTemplate({
  stackName: "consumer-stack",
  template: {
    Resources: {
      UploadsTopic: {
        Type: "AWS::SNS::Topic",
        Properties: {
          TopicName: "uploads-topic",
          DisplayName: { "Fn::ImportValue": "producer-stack:UploadsBucket" },
        },
      },
    },
  },
});

await consumer.waitForDeployComplete();

// shared-uploads, read from the export the producer Stack published
console.log(consumer.resources.get("UploadsTopic")?.properties["DisplayName"]);
