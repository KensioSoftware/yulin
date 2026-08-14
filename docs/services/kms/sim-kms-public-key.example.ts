/**
 * Verifying a simulated KMS signature outside KMS, with its public key.
 */

import { createPublicKey, verify } from "node:crypto";

import {
  CreateKeyCommand,
  GetPublicKeyCommand,
  SignCommand,
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

const fetched = await kms.getPublicKey(
  new GetPublicKeyCommand({ KeyId: created.KeyMetadata?.Arn }),
);

const publicKey = createPublicKey({
  key: Buffer.from(fetched.PublicKey ?? new Uint8Array()),
  format: "der",
  type: "spki",
});

console.log(
  verify("sha256", message, publicKey, signed.Signature ?? new Uint8Array()),
); // true
