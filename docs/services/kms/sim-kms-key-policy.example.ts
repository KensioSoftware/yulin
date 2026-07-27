/**
 * A simulated KMS key policy deciding who can use the key.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { CreateKeyCommand, EncryptCommand } from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";
import { SimIamAccessDenied } from "@kensio/yulin/iam";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "Encrypter",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: `arn:aws:iam::${accountId}:root` },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

// A key policy naming the Role directly, with no delegation to the Account.
const created = await simAws.kms().createKey(
  new CreateKeyCommand({
    Policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: role.Role.Arn },
          Action: "kms:Encrypt",
          Resource: "*",
        },
      ],
    }),
  }),
);

// The Role can encrypt, with no identity policy of its own.
await simAws.kms().encrypt(
  new EncryptCommand({
    KeyId: created.KeyMetadata?.Arn,
    Plaintext: Buffer.from("hunter2", "utf8"),
  }),
  { caller: { kind: "arn", arn: role.Role.Arn } },
);

// The Account root cannot, because this key policy does not admit it.
try {
  await simAws.kms().encrypt(
    new EncryptCommand({
      KeyId: created.KeyMetadata?.Arn,
      Plaintext: Buffer.from("hunter2", "utf8"),
    }),
  );
} catch (error) {
  console.log(error instanceof SimIamAccessDenied); // true
}
