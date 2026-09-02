/**
 * Describing a deleted simulated CloudFormation Stack by its Stack ID.
 */

import {
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

const created = await simCfn.createStack(
  new CreateStackCommand({
    StackName: "identified-stack",
    TemplateBody: JSON.stringify({ Resources: {} }),
  }),
);

// arn:aws:cloudformation:<region>:<account>:stack/identified-stack/<uuid>
console.log(created.StackId);

await simCfn.waitForStackDeployComplete("identified-stack");

await simCfn.deleteStack(
  new DeleteStackCommand({ StackName: "identified-stack" }),
);
await simCfn.waitForStackDeleteComplete("identified-stack");

const described = await simCfn.describeStacks(
  new DescribeStacksCommand({ StackName: created.StackId }),
);

// DELETE_COMPLETE
console.log(described.Stacks?.[0]?.StackStatus);
