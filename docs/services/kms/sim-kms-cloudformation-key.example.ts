/**
 * Deploying a KMS key and alias from a CloudFormation template, then
 * encrypting through the alias the template created.
 */

import { DecryptCommand, EncryptCommand } from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "app-stack",
  template: {
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
    Outputs: {
      KeyArn: { Value: { "Fn::GetAtt": ["AppKey", "Arn"] } },
    },
  },
});
await stack.waitForDeployComplete();

const kms = simAws.kms();

const encrypted = await kms.encrypt(
  new EncryptCommand({
    KeyId: "alias/app-key",
    Plaintext: Buffer.from("hunter2", "utf8"),
  }),
);

const decrypted = await kms.decrypt(
  new DecryptCommand({ CiphertextBlob: encrypted.CiphertextBlob }),
);

console.log(Buffer.from(decrypted.Plaintext ?? []).toString("utf8")); // "hunter2"
console.log(stack.output("KeyArn")); // "arn:aws:kms:...:key/..."
