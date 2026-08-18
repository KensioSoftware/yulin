/**
 * Finding a synthesized Resource by the CDK construct ID it came from.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "construct-id-stack",
  template: {
    Resources: {
      // As CDK synthesizes it, with a hash on the logical ID and the construct
      // path in Metadata.
      UploadsBucket9F8E7D6C: {
        Type: "AWS::S3::Bucket",
        Metadata: {
          "aws:cdk:path": "UploadsStack/UploadsBucket/Resource",
        },
        Properties: {
          BucketName: "construct-id-uploads",
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.getResource("UploadsBucket")?.logicalId);
// "UploadsBucket9F8E7D6C"
