/**
 * Binding an encryption context to a simulated KMS ciphertext.
 */

import {
  CreateKeyCommand,
  DecryptCommand,
  EncryptCommand,
} from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";
import { SimKmsInvalidCiphertextException } from "@kensio/yulin/kms";

const simAws = new SimAws();
const kms = simAws.kms();

const created = await kms.createKey(new CreateKeyCommand({}));

const encrypted = await kms.encrypt(
  new EncryptCommand({
    KeyId: created.KeyMetadata?.Arn,
    Plaintext: Buffer.from("hunter2", "utf8"),
    EncryptionContext: { tenant: "acme" },
  }),
);

try {
  await kms.decrypt(
    new DecryptCommand({
      CiphertextBlob: encrypted.CiphertextBlob,
      EncryptionContext: { tenant: "other" },
    }),
  );
} catch (error) {
  // The wrong context fails the cipher's own authentication, exactly as it
  // does on real KMS.
  console.log(error instanceof SimKmsInvalidCiphertextException); // true
}
