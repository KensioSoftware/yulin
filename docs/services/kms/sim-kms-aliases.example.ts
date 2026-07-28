/**
 * Naming a simulated KMS key by alias.
 */

import {
  CreateAliasCommand,
  CreateKeyCommand,
  DescribeKeyCommand,
  EncryptCommand,
} from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const kms = simAws.kms();

const created = await kms.createKey(new CreateKeyCommand({}));
await kms.createAlias(
  new CreateAliasCommand({
    AliasName: "alias/app-key",
    TargetKeyId: created.KeyMetadata?.KeyId,
  }),
);

// The alias reaches the same key as its ID or ARN would.
await kms.encrypt(
  new EncryptCommand({
    KeyId: "alias/app-key",
    Plaintext: Buffer.from("hunter2", "utf8"),
  }),
);

// An AWS managed key appears the first time its alias is referenced.
const managed = await kms.describeKey(
  new DescribeKeyCommand({ KeyId: "alias/aws/s3" }),
);

console.log(managed.KeyMetadata?.KeyManager); // "AWS"
