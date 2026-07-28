import {
  DecryptCommand,
  DescribeKeyCommand,
  EncryptCommand,
  GetKeyPolicyCommand,
  ListAliasesCommand,
  ListKeysCommand,
} from "@aws-sdk/client-kms";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsErrorAsync,
  assertTrue,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimKmsKey } from "../key/sim-kms-key.js";

const accountIdOneOnes = "111111111111" as SimAwsAccountId;

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

const appKeyTemplate = {
  Resources: {
    AppKey: {
      Type: "AWS::KMS::Key",
      Properties: { Description: "Application data key" },
    },
    AppKeyAlias: {
      Type: "AWS::KMS::Alias",
      Properties: {
        AliasName: "alias/app-key",
        TargetKeyId: { Ref: "AppKey" },
      },
    },
  },
};

describe("KMS CloudFormation Key and Alias deployment", () => {
  it("creates a key an alias resolves, and encrypts with it", async () => {
    // Given a template declaring a key and an alias pointing at it.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "app-stack", template: appKeyTemplate });
    await stack.waitForDeployComplete();

    // Then the alias resolves to the deployed key.
    const kms = simAws.kms();
    const described = await kms.describeKey(
      new DescribeKeyCommand({ KeyId: "alias/app-key" }),
    );

    assertNonNullable(described.KeyMetadata);
    assertIdentical(described.KeyMetadata.Description, "Application data key");
    assertTrue(described.KeyMetadata.Enabled);
    assertIdentical(described.KeyMetadata.KeyState, "Enabled");

    // And the key encrypts and decrypts through its alias, as a deployed
    // application would use it.
    const encrypted = await kms.encrypt(
      new EncryptCommand({
        KeyId: "alias/app-key",
        Plaintext: new TextEncoder().encode("hunter2"),
      }),
    );
    assertNonNullable(encrypted.CiphertextBlob);

    const decrypted = await kms.decrypt(
      new DecryptCommand({ CiphertextBlob: encrypted.CiphertextBlob }),
    );
    assertNonNullable(decrypted.Plaintext);
    assertIdentical(new TextDecoder().decode(decrypted.Plaintext), "hunter2");
  });

  it("lists the deployed key and alias", async () => {
    // Given a deployed key and alias.
    const simAws = simAwsInEuWest2();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "app-stack", template: appKeyTemplate });
    await stack.waitForDeployComplete();

    // When the account's keys and aliases are listed.
    const kms = simAws.kms();
    const keys = await kms.listKeys(new ListKeysCommand({}));
    const aliases = await kms.listAliases(new ListAliasesCommand({}));

    // Then both the template declared are there.
    assertArrayLength(keys.Keys ?? [], 1);
    assertArrayLength(aliases.Aliases ?? [], 1);

    const alias = aliases.Aliases?.at(0);
    assertNonNullable(alias);
    assertIdentical(alias.AliasName, "alias/app-key");
    assertIdentical(alias.TargetKeyId, keys.Keys?.at(0)?.KeyId);
    assertIdentical(
      alias.AliasArn,
      "arn:aws:kms:eu-west-2:111111111111:alias/app-key",
    );
  });

  it("resolves Ref to the key ID and Fn::GetAtt to the ARN and key ID", async () => {
    // Given a template referencing its key every way CloudFormation allows.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "app-stack",
      template: {
        ...appKeyTemplate,
        Outputs: {
          KeyRef: { Value: { Ref: "AppKey" } },
          KeyArn: { Value: { "Fn::GetAtt": ["AppKey", "Arn"] } },
          KeyId: { Value: { "Fn::GetAtt": ["AppKey", "KeyId"] } },
          AliasRef: { Value: { Ref: "AppKeyAlias" } },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then Ref gives the bare key ID, not the ARN, as on real AWS.
    const keyRef = stack.outputs.get("KeyRef")?.value;
    const keyArn = stack.outputs.get("KeyArn")?.value;

    assertTypeString(keyRef);
    assertTypeString(keyArn);
    assertIdentical(stack.outputs.get("KeyId")?.value, keyRef);
    assertIdentical(keyArn, `arn:aws:kms:eu-west-2:111111111111:key/${keyRef}`);

    // And Ref on the alias gives the alias name, which is itself a KeyId.
    assertIdentical(stack.outputs.get("AliasRef")?.value, "alias/app-key");

    const described = await simAws
      .kms()
      .describeKey(new DescribeKeyCommand({ KeyId: keyRef }));
    assertIdentical(described.KeyMetadata?.Arn, keyArn);
  });

  it("applies the KeyPolicy the template declares", async () => {
    // Given a template declaring a key policy as an object, as a template
    // writes one.
    const simAws = simAwsInEuWest2();
    const keyPolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "DelegateToAccountIam",
          Effect: "Allow",
          Principal: { AWS: "arn:aws:iam::111111111111:root" },
          Action: "kms:*",
          Resource: "*",
        },
      ],
    };

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "app-stack",
      template: {
        Resources: {
          AppKey: {
            Type: "AWS::KMS::Key",
            Properties: { KeyPolicy: keyPolicy },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the deployed key holds that policy verbatim rather than the default
    // one, so GetKeyPolicy returns exactly what the template declared.
    const key = keyOf(stack.getResource("AppKey")?.simResource);
    const stored = await simAws
      .kms()
      .getKeyPolicy(new GetKeyPolicyCommand({ KeyId: key.keyId }));

    assertIdentical(stored.Policy, JSON.stringify(keyPolicy));
    assertIdentical(stored.PolicyName, "default");
  });

  it("deploys a KeyPolicy that locks the key down", async () => {
    // Given a template whose key policy names only one role, which is the
    // case worth being able to test: no IAM policy widens it.
    const simAws = simAwsInEuWest2();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "app-stack",
      template: {
        Resources: {
          AppKey: {
            Type: "AWS::KMS::Key",
            Properties: {
              KeyPolicy: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Principal: { AWS: "arn:aws:iam::111111111111:role/app" },
                    Action: "kms:*",
                    Resource: "*",
                  },
                ],
              },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // When another principal in the account tries to use the key.
    const key = keyOf(stack.getResource("AppKey")?.simResource);
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().describeKey(new DescribeKeyCommand({ KeyId: key.keyId })),
    );

    // Then it is denied, because the template's policy never delegated to the
    // account's IAM.
    assertStringIncludes(error.message, "kms:DescribeKey");
  });

  it("gets the default root-delegation policy with no KeyPolicy", async () => {
    // Given a template declaring a key with no policy at all.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "app-stack", template: appKeyTemplate });
    await stack.waitForDeployComplete();

    // Then the key gets the default policy CreateKey applies, which delegates
    // to the account's IAM rather than granting anything outright.
    const key = keyOf(stack.getResource("AppKey")?.simResource);
    const stored = await simAws
      .kms()
      .getKeyPolicy(new GetKeyPolicyCommand({ KeyId: key.keyId }));

    assertTypeString(stored.Policy);
    assertStringIncludes(stored.Policy, "Enable IAM User Permissions");
    assertStringIncludes(stored.Policy, "arn:aws:iam::111111111111:root");
  });

  it("creates a disabled key for Enabled false", async () => {
    // Given a template asking for a key that is disabled from the start.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "app-stack",
      template: {
        Resources: {
          AppKey: { Type: "AWS::KMS::Key", Properties: { Enabled: false } },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the key exists and is disabled, so using it fails as it would on
    // real AWS.
    const key = keyOf(stack.getResource("AppKey")?.simResource);
    const described = await simAws
      .kms()
      .describeKey(new DescribeKeyCommand({ KeyId: key.keyId }));

    assertNonNullable(described.KeyMetadata);
    assertFalse(described.KeyMetadata.Enabled);
    assertIdentical(described.KeyMetadata.KeyState, "Disabled");
  });

  it("creates the key in the stack's account and region", async () => {
    // Given a simulated AWS whose default scope is not the stack's.
    const simAws = new SimAws();

    // When a template is deployed into another account and region.
    const stack = await simAws
      .account(accountIdOneOnes)
      .region("us-east-1")
      .cloudFormation()
      .deployTemplate({ stackName: "app-stack", template: appKeyTemplate });
    await stack.waitForDeployComplete();

    // Then the key and its alias exist there, and nowhere else.
    const scoped = simAws.account(accountIdOneOnes).region("us-east-1").kms();
    const key = scoped.findKey("alias/app-key");

    assertNonNullable(key);
    assertStringStartsWith(key.arn, "arn:aws:kms:us-east-1:111111111111:key/");
    assertUndefined(simAws.kms().findAlias("alias/app-key"));
  });
});

/**
 * Narrow the simulated resource a CloudFormation Resource is backed by to the
 * key it should be.
 */
function keyOf(simResource: object | undefined): SimKmsKey {
  const key = simResource as SimKmsKey | undefined;
  assertNonNullable(key);

  return key;
}
