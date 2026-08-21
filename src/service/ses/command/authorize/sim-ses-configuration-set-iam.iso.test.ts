import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateConfigurationSetCommand,
  ListConfigurationSetsCommand,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayLength,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

const accountIdOneOnes = "111111111111";

/** A simulation with one Role carrying whatever policy statement is wanted. */
async function simAwsWithRole(policyStatement: object): Promise<SimAws> {
  const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });

  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "DeployerRole",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "DeployerRole",
      PolicyName: "ManageConfigurationSets",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: policyStatement,
      }),
    }),
  );

  return simAws;
}

/** The request options that make a call arrive as the Role. */
const asRole = {
  caller: {
    kind: "arn",
    arn: `arn:aws:iam::${accountIdOneOnes}:role/DeployerRole`,
  },
} as const;

const transactional = new CreateConfigurationSetCommand({
  ConfigurationSetName: "transactional",
});

describe("SES configuration set IAM authorization", () => {
  it("allows an operation the policy names", async () => {
    // Given a Role allowed to create one set by name.
    const simAws = await simAwsWithRole({
      Action: "ses:CreateConfigurationSet",
      Resource: `arn:aws:ses:us-east-1:${accountIdOneOnes}:configuration-set/transactional`,
    });

    // When it creates that set.
    await simAws.sesV2().createConfigurationSet(transactional, asRole);

    assertArrayLength(simAws.sesV2().allConfigurationSets(), 1);
  });

  it("refuses an operation on another set", async () => {
    // Given a Role allowed to create one set only.
    const simAws = await simAwsWithRole({
      Action: "ses:CreateConfigurationSet",
      Resource: `arn:aws:ses:us-east-1:${accountIdOneOnes}:configuration-set/marketing`,
    });

    // When it creates a different one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sesV2().createConfigurationSet(transactional, asRole);
    });

    // Then IAM refuses it, naming the set ARN it authorized against.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, "configuration-set/transactional");
  });

  it("needs a policy on every resource to list the sets", async () => {
    // Given a Role allowed to list on `*`, which is the only resource real SES
    // gives that action.
    const simAws = await simAwsWithRole({
      Action: "ses:ListConfigurationSets",
      Resource: "*",
    });

    const listed = await simAws
      .sesV2()
      .listConfigurationSets(new ListConfigurationSetsCommand({}), asRole);

    assertArrayLength(listed.ConfigurationSets ?? [], 0);
  });

  it("refuses a listing to a policy naming set ARNs", async () => {
    // Given a Role allowed to list, on every set in the Account.
    const simAws = await simAwsWithRole({
      Action: "ses:ListConfigurationSets",
      Resource: `arn:aws:ses:us-east-1:${accountIdOneOnes}:configuration-set/*`,
    });

    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sesV2()
        .listConfigurationSets(new ListConfigurationSetsCommand({}), asRole);
    });

    // Then it is refused. The action has no resource type on real SES, so a
    // policy scoped to set ARNs allows no listing however broadly they are
    // written.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
