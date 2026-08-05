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
          VersioningConfiguration: { Status: "Enabled" },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

// The Bucket exists and is usable, unversioned.
console.log(stack.getResource("UploadsBucket")?.deployed);
// true

for (const ignored of stack.ignoredProperties) {
  console.log(ignored.logicalId, ignored.path, ignored.reason);
  // "UploadsBucket VersioningConfiguration VersioningConfiguration is a real
  //  AWS::S3::Bucket property simulated S3 does not act on: Object versions
  //  are not simulated, ..."
}
