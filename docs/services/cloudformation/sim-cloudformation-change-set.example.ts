/**
 * Deploying a simulated CloudFormation Stack through a change set.
 */

import {
  CreateChangeSetCommand,
  DescribeChangeSetCommand,
  ExecuteChangeSetCommand,
} from "@aws-sdk/client-cloudformation";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

const templateBody = JSON.stringify({
  Resources: {
    ReportsBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "change-set-reports" },
    },
  },
});

// A CREATE change set brings the Stack into being in REVIEW_IN_PROGRESS,
// holding no created Resources.
await simCfn.createChangeSet(
  new CreateChangeSetCommand({
    StackName: "reports-stack",
    ChangeSetName: "reports-create",
    ChangeSetType: "CREATE",
    TemplateBody: templateBody,
  }),
);

// Describing it says what executing it would do. Nothing is deployed yet.
const described = await simCfn.describeChangeSet(
  new DescribeChangeSetCommand({
    StackName: "reports-stack",
    ChangeSetName: "reports-create",
  }),
);

// [{ Action: "Add", LogicalResourceId: "ReportsBucket" }]
console.log(
  described.Changes?.map((change) => ({
    Action: change.ResourceChange.Action,
    LogicalResourceId: change.ResourceChange.LogicalResourceId,
  })),
);

// Executing it deploys the template.
await simCfn.executeChangeSet(
  new ExecuteChangeSetCommand({
    StackName: "reports-stack",
    ChangeSetName: "reports-create",
  }),
);
await simCfn.waitForStackDeployComplete("reports-stack");

console.log(simAws.s3().getSimBucketByName("change-set-reports"));
