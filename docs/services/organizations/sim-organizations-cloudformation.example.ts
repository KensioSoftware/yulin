/**
 * Building an organization from a CloudFormation template.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "org-stack",
  template: {
    Resources: {
      Organization: { Type: "AWS::Organizations::Organization" },
      Workloads: {
        Type: "AWS::Organizations::OrganizationalUnit",
        Properties: {
          Name: "Workloads",
          ParentId: { "Fn::GetAtt": ["Organization", "RootId"] },
        },
      },
      DenyBucketCreation: {
        Type: "AWS::Organizations::Policy",
        Properties: {
          Name: "DenyBucketCreation",
          Type: "SERVICE_CONTROL_POLICY",
          TargetIds: [{ Ref: "Workloads" }],
          Content: {
            Version: "2012-10-17",
            Statement: [
              { Effect: "Deny", Action: "s3:CreateBucket", Resource: "*" },
            ],
          },
        },
      },
    },
    Outputs: { WorkloadsId: { Value: { Ref: "Workloads" } } },
  },
});

await stack.waitForDeployComplete();

simAws.organizations().moveAccount("123456789012", stack.output("WorkloadsId"));

const decision = simAws.account("123456789012").iam().authorize({
  action: "s3:CreateBucket",
  resource: "arn:aws:s3:::reports-bucket",
});

console.log(decision.value); // "ExplicitDeny"
