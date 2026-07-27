/**
 * Encrypting and decrypting with a simulated KMS key.
 */

import {
  CreateKeyCommand,
  DecryptCommand,
  EncryptCommand,
} from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const kms = simAws.kms();

const created = await kms.createKey(
  new CreateKeyCommand({ Description: "Application key" }),
);

const encrypted = await kms.encrypt(
  new EncryptCommand({
    KeyId: created.KeyMetadata?.Arn,
    Plaintext: Buffer.from("hunter2", "utf8"),
  }),
);

const decrypted = await kms.decrypt(
  new DecryptCommand({ CiphertextBlob: encrypted.CiphertextBlob }),
);

console.log(Buffer.from(decrypted.Plaintext ?? []).toString("utf8")); // "hunter2"
