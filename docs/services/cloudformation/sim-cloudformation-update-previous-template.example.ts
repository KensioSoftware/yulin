/**
 * Changing one parameter value without resending the template.
 */

import {
  CreateStackCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

await simCfn.createStack(
  new CreateStackCommand({
    StackName: "reports",
    TemplateBody: JSON.stringify({
      Parameters: {
        Environment: { Type: "String" },
        Version: { Type: "String" },
      },
      Resources: {
        ReportsBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            // eslint-disable-next-line no-template-curly-in-string
            BucketName: { "Fn::Sub": "reports-${Environment}-${Version}" },
          },
        },
      },
    }),
    Parameters: [
      { ParameterKey: "Environment", ParameterValue: "staging" },
      { ParameterKey: "Version", ParameterValue: "one" },
    ],
  }),
);
await simCfn.waitForStackDeployComplete("reports");

// Only the version moves. The template and the environment stay where the
// deployment put them.
await simCfn.updateStack(
  new UpdateStackCommand({
    StackName: "reports",
    UsePreviousTemplate: true,
    Parameters: [
      { ParameterKey: "Environment", UsePreviousValue: true },
      { ParameterKey: "Version", ParameterValue: "two" },
    ],
  }),
);
await simCfn.waitForStackUpdateComplete("reports");

console.log(simAws.s3().getSimBucketByName("reports-staging-two"));
