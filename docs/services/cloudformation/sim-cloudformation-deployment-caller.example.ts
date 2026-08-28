/**
 * Deploying a template as the principal a real deployment would run as.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "reports-stack",
  template: {
    Resources: {
      ReportsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "reports-bucket" },
      },
    },
  },
  caller: {
    kind: "arn",
    arn: "arn:aws:iam::123456789012:role/cdk-deploy-role",
  },
});

console.log(stack.getResource("ReportsBucket")?.status); // "CREATE_COMPLETE"
