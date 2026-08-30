/**
 * Finding out which properties a Stack created its Resources without.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "uploads-stack",
  template: {
    Resources: {
      UploadsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "uploads",
          AccelerateConfiguration: { AccelerationStatus: "Enabled" },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

// The Bucket exists and is usable, without transfer acceleration.
console.log(stack.getResource("UploadsBucket")?.deployed);
// true

for (const ignored of stack.ignoredProperties) {
  console.log(ignored.logicalId, ignored.path, ignored.reason);
  // "UploadsBucket AccelerateConfiguration AccelerateConfiguration is a real
  //  AWS::S3::Bucket property simulated S3 does not act on: transfer
  //  acceleration is not simulated"
}
