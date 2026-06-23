/**
 * Deploying stacks in different simulated Accounts and Regions.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const defaultCfn = simAws.cloudFormation();
const euWest2Cfn = simAws.region("eu-west-2").cloudFormation();
const accountCfn = simAws.account("111111111111").cloudFormation();
const scopedCfn = simAws
  .account("222222222222")
  .region("ap-east-1")
  .cloudFormation();

await defaultCfn.deployTemplate({
  stackName: "default-stack",
  template: {
    Resources: {
      DefaultHandle: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
      },
    },
  },
});

await euWest2Cfn.deployTemplate({
  stackName: "regional-stack",
  template: {
    Resources: {
      RegionalHandle: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
      },
    },
  },
});

await accountCfn.deployTemplate({
  stackName: "account-stack",
  template: {
    Resources: {
      AccountHandle: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
      },
    },
  },
});

await scopedCfn.deployTemplate({
  stackName: "scoped-stack",
  template: {
    Resources: {
      ScopedHandle: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
      },
    },
  },
});
