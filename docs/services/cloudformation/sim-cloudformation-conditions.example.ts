/**
 * Choosing resources and property values by condition in a simulated CFN template.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "conditions-stack",
  template: {
    Parameters: {
      EnvName: { Type: "String" },
    },
    Conditions: {
      IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] },
    },
    Resources: {
      Backups: {
        Type: "AWS::S3::Bucket",
        Condition: "IsProd",
        Properties: { BucketName: "site-backups" },
      },
      Site: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            // eslint-disable-next-line no-template-curly-in-string
            "Fn::If": ["IsProd", "site", { "Fn::Sub": "site-${EnvName}" }],
          },
        },
      },
    },
  },
  parameters: { EnvName: "dev" },
});

await stack.waitForDeployComplete();

// site-dev
console.log(simAws.s3().getSimBucketByName("site-dev")?.bucketName);

// false, because IsProd is false
console.log(stack.getResource("Backups") !== undefined);
