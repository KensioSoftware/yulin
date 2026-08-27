/**
 * A CloudFormation Resource a service control policy denies.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

simAws.organizations().attachServiceControlPolicy("123456789012", {
  Version: "2012-10-17",
  Statement: { Effect: "Deny", Action: "s3:CreateBucket", Resource: "*" },
});

try {
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
  });

  await stack.waitForDeployComplete();
} catch (error) {
  // "... is not authorized to perform: s3:CreateBucket on resource:
  //  arn:aws:s3:::reports-bucket with an explicit deny in a service control policy"
  console.log((error as Error).message);
}

const failed = simAws
  .cloudFormation()
  .getStackByName("reports-stack")
  ?.getResource("ReportsBucket");

console.log(failed?.status); // "CREATE_FAILED"
