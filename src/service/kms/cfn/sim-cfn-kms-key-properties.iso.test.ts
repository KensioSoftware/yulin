import { GetKeyPolicyCommand } from "@aws-sdk/client-kms";
import { assertFalse, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { simKmsCfnKey } from "../../../../test/kms/cfn-key-resource.js";

const accountIdOneOnes = "111111111111" as SimAwsAccountId;

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

describe("KMS CloudFormation Key property shapes", () => {
  it("reads the string forms CloudFormation carries values in", async () => {
    // Given a template whose Enabled is CloudFormation's string form of a
    // boolean, and whose KeyPolicy is inlined JSON rather than an object.
    const simAws = simAwsInEuWest2();
    const policyJson = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "Inlined",
          Effect: "Allow",
          Principal: { AWS: "arn:aws:iam::111111111111:root" },
          Action: "kms:*",
          Resource: "*",
        },
      ],
    });

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "app-stack",
      template: {
        Resources: {
          AppKey: {
            Type: "AWS::KMS::Key",
            Properties: { Enabled: "false", KeyPolicy: policyJson },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then both are read as the values they stand for.
    const key = simKmsCfnKey(stack.getResource("AppKey")?.simResource);
    const stored = await simAws
      .kms()
      .getKeyPolicy(new GetKeyPolicyCommand({ KeyId: key.keyId }));

    assertIdentical(stored.Policy, policyJson);
    assertFalse(key.isEnabled);
  });

  it("resolves the intrinsics CDK nests inside a KeyPolicy", async () => {
    // Given the KeyPolicy shape CDK synthesises for a new kms.Key, whose
    // account root principal is an Fn::Join over pseudo parameters rather than
    // a literal ARN.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "app-stack",
      template: {
        Resources: {
          AppKey: {
            Type: "AWS::KMS::Key",
            UpdateReplacePolicy: "Retain",
            DeletionPolicy: "Retain",
            Properties: {
              KeyPolicy: {
                Statement: [
                  {
                    Action: "kms:*",
                    Effect: "Allow",
                    Principal: {
                      AWS: {
                        "Fn::Join": [
                          "",
                          [
                            "arn:",
                            { Ref: "AWS::Partition" },
                            ":iam::",
                            { Ref: "AWS::AccountId" },
                            ":root",
                          ],
                        ],
                      },
                    },
                    Resource: "*",
                  },
                ],
                Version: "2012-10-17",
              },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the policy the key holds names the resolved account root, so the
    // key delegates to the account's IAM as the CDK construct intends.
    const key = simKmsCfnKey(stack.getResource("AppKey")?.simResource);
    const stored = await simAws
      .kms()
      .getKeyPolicy(new GetKeyPolicyCommand({ KeyId: key.keyId }));

    assertIdentical(
      stored.Policy,
      JSON.stringify({
        Statement: [
          {
            Action: "kms:*",
            Effect: "Allow",
            Principal: { AWS: "arn:aws:iam::111111111111:root" },
            Resource: "*",
          },
        ],
        Version: "2012-10-17",
      }),
    );
  });
});
