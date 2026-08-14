/**
 * Signing and verifying with a simulated asymmetric KMS key.
 */

import {
  CreateKeyCommand,
  SignCommand,
  VerifyCommand,
} from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const kms = simAws.kms();

const created = await kms.createKey(
  new CreateKeyCommand({
    KeySpec: "ECC_NIST_P256",
    KeyUsage: "SIGN_VERIFY",
  }),
);

const message = Buffer.from("order-1234", "utf8");

const signed = await kms.sign(
  new SignCommand({
    KeyId: created.KeyMetadata?.Arn,
    Message: message,
    SigningAlgorithm: "ECDSA_SHA_256",
  }),
);

const verified = await kms.verify(
  new VerifyCommand({
    KeyId: created.KeyMetadata?.Arn,
    Message: message,
    Signature: signed.Signature,
    SigningAlgorithm: "ECDSA_SHA_256",
  }),
);

console.log(verified.SignatureValid); // true
