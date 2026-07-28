/**
 * Envelope encryption with a simulated KMS data key.
 */

import {
  CreateKeyCommand,
  DecryptCommand,
  GenerateDataKeyCommand,
} from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const kms = simAws.kms();

const created = await kms.createKey(new CreateKeyCommand({}));

const dataKey = await kms.generateDataKey(
  new GenerateDataKeyCommand({
    KeyId: created.KeyMetadata?.Arn,
    KeySpec: "AES_256",
  }),
);

console.log(dataKey.Plaintext?.length); // 32

// Store dataKey.CiphertextBlob with the data; discard the plaintext copy.
const recovered = await kms.decrypt(
  new DecryptCommand({ CiphertextBlob: dataKey.CiphertextBlob }),
);

console.log(recovered.Plaintext?.length); // 32
