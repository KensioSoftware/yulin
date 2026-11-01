import { SimAws } from "../../aws/sim-aws.js";
import {
  makeSimAwsAccountId,
  type SimAwsAccountId,
} from "../../aws/sim-aws-account.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

export const readHandlerRegionName = "eu-west-2";

/** A Bucket an update adds, so that the update has something to do. */
export const addedBucket = {
  Type: "AWS::S3::Bucket",
  Properties: { BucketName: "chineseboost-sources" },
};

/** A simulation in a fresh Account, in the Region the tests read ARNs in. */
export function readHandlerSimulation(): {
  simAws: SimAws;
  accountId: SimAwsAccountId;
} {
  const accountId = makeSimAwsAccountId();

  return {
    simAws: new SimAws({
      defaultAccountId: accountId,
      defaultRegionName: readHandlerRegionName,
    }),
    accountId,
  };
}

/**
 * Update a Stack, which goes on running as the role it was deployed as.
 */
export async function updateStack(
  simAws: SimAws,
  stackName: string,
  template: object,
): Promise<void> {
  await simAws.cloudFormation().updateStack({
    input: { StackName: stackName, TemplateBody: jsonStringify(template) },
  });
}

/**
 * A Role a deployment can run as, holding the statements it is given.
 */
export async function deployRole(
  simAws: SimAws,
  accountId: SimAwsAccountId,
  statements: readonly object[],
): Promise<SimAwsCaller> {
  const iam = simAws.account(accountId).iam();

  await iam.createRole({
    input: {
      RoleName: "deployer",
      AssumeRolePolicyDocument: jsonStringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "sts:AssumeRole",
          Principal: { Service: "cloudformation.amazonaws.com" },
        },
      }),
    },
  });

  await iam.putRolePolicy({
    input: {
      RoleName: "deployer",
      PolicyName: "deployer-policy",
      PolicyDocument: jsonStringify({
        Version: "2012-10-17",
        Statement: statements,
      }),
    },
  });

  return { kind: "arn", arn: `arn:aws:iam::${accountId}:role/deployer` };
}
