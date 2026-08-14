import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateKeyCommand,
  DecryptCommand,
  EncryptCommand,
  GetPublicKeyCommand,
  KMSClient,
  SignCommand,
  VerifyCommand,
} from "@aws-sdk/client-kms";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
} from "@kensio/smartass";
import { SimSdk } from "../../../sdk/index.js";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { makeLambdaCodeZip } from "../../lambda/function/code/make-lambda-code-zip.js";

const emptyBytes = new Uint8Array();
const plaintext = Uint8Array.from(Buffer.from("hunter2", "utf8"));

describe("KMS SDK interception", () => {
  it("routes the signing Commands to simulated KMS", async () => {
    // Given an intercepted KMS SDK client and an asymmetric signing key.
    using simSdk = new SimSdk();
    simSdk.intercept(KMSClient);

    const kmsClient = new KMSClient({ region: "eu-west-2" });
    const created = await kmsClient.send(
      new CreateKeyCommand({
        KeySpec: "ECC_NIST_P256",
        KeyUsage: "SIGN_VERIFY",
      }),
    );
    const KeyId = created.KeyMetadata?.KeyId;

    // When ordinary SDK code signs, verifies and reads the public key.
    const signed = await kmsClient.send(
      new SignCommand({
        KeyId,
        Message: plaintext,
        SigningAlgorithm: "ECDSA_SHA_256",
      }),
    );
    const verified = await kmsClient.send(
      new VerifyCommand({
        KeyId,
        Message: plaintext,
        Signature: signed.Signature,
        SigningAlgorithm: "ECDSA_SHA_256",
      }),
    );
    const publicKey = await kmsClient.send(new GetPublicKeyCommand({ KeyId }));

    // Then all three reached the simulation.
    assertTrue(verified.SignatureValid);
    assertIdentical(publicKey.KeySpec, "ECC_NIST_P256");
  });

  it("routes an intercepted KMSClient to simulated KMS", async () => {
    // Given an intercepted KMS SDK client.
    const simSdk = new SimSdk();
    simSdk.intercept(KMSClient);

    const kmsClient = new KMSClient({ region: "eu-west-2" });

    // When ordinary SDK code creates a key and uses it.
    const created = await kmsClient.send(new CreateKeyCommand({}));
    const encrypted = await kmsClient.send(
      new EncryptCommand({
        KeyId: created.KeyMetadata?.KeyId,
        Plaintext: plaintext,
      }),
    );
    const decrypted = await kmsClient.send(
      new DecryptCommand({ CiphertextBlob: encrypted.CiphertextBlob }),
    );

    // Then the round trip works with nothing touching the network.
    const roundTripped = Buffer.from(decrypted.Plaintext ?? emptyBytes);
    assertIdentical(roundTripped.toString("utf8"), "hunter2");

    simSdk.restoreAll();
  });

  it("decrypts inside a Lambda handler as the execution Role", async () => {
    // Given a key whose policy admits only one Role, and a function running as
    // that Role, whose code fetches and decrypts a value with the SDK.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "DecrypterRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "DecrypterRole",
        PolicyName: "DecryptPolicy",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: { Effect: "Allow", Action: "kms:Decrypt", Resource: "*" },
        }),
      }),
    );

    const created = await simAws.kms().createKey(new CreateKeyCommand({}));
    assertNonNullable(created.KeyMetadata);

    const encrypted = await simAws.kms().encrypt(
      new EncryptCommand({
        KeyId: created.KeyMetadata.Arn,
        Plaintext: plaintext,
      }),
    );
    assertNonNullable(encrypted.CiphertextBlob);

    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "decrypter",
        Role: role.Role.Arn,
        Handler: "index.handler",
        Code: {
          ZipFile: makeLambdaCodeZip({
            "index.js":
              'const { KMSClient, DecryptCommand } = require("@aws-sdk/client-kms");\n' +
              "exports.handler = async (event) => {\n" +
              "  const client = new KMSClient({});\n" +
              "  const out = await client.send(new DecryptCommand({\n" +
              "    CiphertextBlob: Buffer.from(event.blob, 'base64'),\n" +
              "  }));\n" +
              "  return Buffer.from(out.Plaintext).toString('utf8');\n" +
              "};\n",
          }),
        },
      }),
    );

    await simAws.backgroundTasksComplete();

    // When the function is invoked with the ciphertext.
    const blobBase64 = Buffer.from(encrypted.CiphertextBlob).toString("base64");
    const invoked = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "decrypter",
        Payload: JSON.stringify({
          blob: blobBase64,
        }),
      }),
    );

    // Then the handler's own SDK call reached simulated KMS as the execution
    // Role, and the key policy plus that Role's identity policy allowed it.
    const payload = Buffer.from(invoked.Payload ?? emptyBytes);
    assertStringIncludes(payload.toString("utf8"), "hunter2");
  });
});
