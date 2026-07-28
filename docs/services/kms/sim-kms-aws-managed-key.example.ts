/**
 * An AWS managed key, usable only through the service that owns it.
 */

import { EncryptCommand, GetKeyPolicyCommand } from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";
import { SimIamAccessDenied } from "@kensio/yulin/iam";

const simAws = new SimAws();

// A request reaching the key through Systems Manager, as Parameter Store makes
// it. No KMS permission is involved.
const encrypted = await simAws.kms().encrypt(
  new EncryptCommand({
    KeyId: "alias/aws/ssm",
    Plaintext: Buffer.from("hunter2", "utf8"),
  }),
  { viaService: "ssm" },
);

console.log(encrypted.KeyId); // the ARN of the aws/ssm key

// The same request made directly is denied, whatever IAM allows.
try {
  await simAws.kms().encrypt(
    new EncryptCommand({
      KeyId: "alias/aws/ssm",
      Plaintext: Buffer.from("hunter2", "utf8"),
    }),
  );
} catch (error) {
  console.log(error instanceof SimIamAccessDenied); // true
}

// Reading the key's metadata is allowed, because that much is delegated.
const policy = await simAws
  .kms()
  .getKeyPolicy(new GetKeyPolicyCommand({ KeyId: "alias/aws/ssm" }));

console.log(policy.Policy); // the via-service-scoped policy
