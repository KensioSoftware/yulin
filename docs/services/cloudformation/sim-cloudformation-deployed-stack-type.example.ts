/**
 * Naming what a deployment answers with, for a helper written somewhere else.
 */

import { SimAws } from "@kensio/yulin";
import type {
  SimCfnDeployedResource,
  SimCfnDeployedStack,
} from "@kensio/yulin/cloudformation";

function deployedBucket(
  stack: SimCfnDeployedStack,
): SimCfnDeployedResource | undefined {
  return stack.getResource("SiteBucket");
}

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "named-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "named-site-bucket",
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(deployedBucket(stack)?.type);
