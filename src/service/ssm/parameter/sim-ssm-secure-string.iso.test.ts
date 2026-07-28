import { CreateKeyCommand, DecryptCommand } from "@aws-sdk/client-kms";
import {
  DescribeParametersCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
  GetParametersCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertStringNotIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import {
  SimSsmInvalidKeyId,
  SimSsmValidationException,
} from "../error/sim-ssm.error.js";

/**
 * The encryption context key real Parameter Store binds a SecureString to.
 */
const parameterArnContextKey = "PARAMETER_ARN";

async function simAwsWithSecret(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.ssm().putParameter(
    new PutParameterCommand({
      Name: "/myapp/prod/db-password",
      Type: "SecureString",
      Value: "hunter2",
    }),
  );

  return simAws;
}

describe("SSM SecureString parameters", () => {
  it("stores the value encrypted rather than in the clear", async () => {
    // Given a SecureString parameter.
    const simAws = await simAwsWithSecret();

    // When it is read without asking for decryption.
    const read = await simAws
      .ssm()
      .getParameter(
        new GetParameterCommand({ Name: "/myapp/prod/db-password" }),
      );

    // Then the ciphertext comes back, which is what a handler that forgets
    // WithDecryption ends up parsing as if it were a password.
    assertNonNullable(read.Parameter);
    assertIdentical(read.Parameter.Type, "SecureString");
    assertStringNotIncludes(String(read.Parameter.Value), "hunter2");
  });

  it("returns the plaintext when the read asks for decryption", async () => {
    // Given the same parameter.
    const simAws = await simAwsWithSecret();

    // When it is read with WithDecryption.
    const read = await simAws.ssm().getParameter(
      new GetParameterCommand({
        Name: "/myapp/prod/db-password",
        WithDecryption: true,
      }),
    );

    // Then the value is the plaintext that was written.
    assertIdentical(read.Parameter?.Value, "hunter2");
  });

  it("encrypts under the aws/ssm managed key when no key is named", async () => {
    // Given a SecureString parameter written without a KeyId.
    const simAws = await simAwsWithSecret();

    // When the parameter is described.
    const described = await simAws
      .ssm()
      .describeParameters(new DescribeParametersCommand({}));

    // Then it reports the AWS managed key Systems Manager creates on demand,
    // as real Parameter Store does for a parameter that names no key.
    const keyId = String(described.Parameters?.at(0)?.KeyId);

    assertStringIncludes(keyId, ":key/");

    const managedKey = simAws.kms().findKey("alias/aws/ssm");

    assertNonNullable(managedKey);
    assertIdentical(managedKey.arn, keyId);
  });

  it("encrypts under a customer managed key when one is named", async () => {
    // Given a customer managed key.
    const simAws = new SimAws();
    const key = await simAws
      .kms()
      .createKey(new CreateKeyCommand({ Description: "Parameter key" }));

    assertNonNullable(key.KeyMetadata?.Arn);

    // When a SecureString parameter names it.
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-password",
        Type: "SecureString",
        Value: "hunter2",
        KeyId: key.KeyMetadata.Arn,
      }),
    );

    // Then the parameter is encrypted under that key and reports it.
    const described = await simAws
      .ssm()
      .describeParameters(new DescribeParametersCommand({}));

    assertIdentical(described.Parameters?.at(0)?.KeyId, key.KeyMetadata.Arn);

    const read = await simAws.ssm().getParameter(
      new GetParameterCommand({
        Name: "/myapp/prod/db-password",
        WithDecryption: true,
      }),
    );

    assertIdentical(read.Parameter?.Value, "hunter2");
  });

  it("refuses a KeyId no key answers to", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a SecureString names a key that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name: "/myapp/prod/db-password",
          Type: "SecureString",
          Value: "hunter2",
          KeyId: "alias/nothing-here",
        }),
      ),
    );

    // Then it is refused as an invalid key, as real Parameter Store reports
    // every KMS key problem.
    assertInstanceOf(error, SimSsmInvalidKeyId);
  });

  it("refuses a KeyId on a parameter stored in the clear", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a String parameter names a key to encrypt with.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name: "/myapp/prod/db-host",
          Type: "String",
          Value: "db.internal",
          KeyId: "alias/aws/ssm",
        }),
      ),
    );

    // Then it is refused, because nothing would encrypt that value.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "SecureString");
  });

  it("encrypts each version of an overwritten parameter", async () => {
    // Given a SecureString parameter that has been overwritten.
    const simAws = await simAwsWithSecret();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-password",
        Value: "hunter3",
        Overwrite: true,
      }),
    );

    // When each version is read with decryption.
    const first = await simAws.ssm().getParameter(
      new GetParameterCommand({
        Name: "/myapp/prod/db-password:1",
        WithDecryption: true,
      }),
    );
    const current = await simAws.ssm().getParameter(
      new GetParameterCommand({
        Name: "/myapp/prod/db-password",
        WithDecryption: true,
      }),
    );

    // Then each one decrypts to what it was written with.
    assertIdentical(first.Parameter?.Value, "hunter2");
    assertIdentical(current.Parameter?.Value, "hunter3");
  });

  it("binds a ciphertext to the ARN of the parameter holding it", async () => {
    // Given a SecureString parameter and the ciphertext it stores.
    const simAws = await simAwsWithSecret();
    const stored = await simAws
      .ssm()
      .getParameter(
        new GetParameterCommand({ Name: "/myapp/prod/db-password" }),
      );

    assertNonNullable(stored.Parameter?.Value);
    assertNonNullable(stored.Parameter.ARN);

    const ciphertextBlob = Buffer.from(stored.Parameter.Value, "base64");
    const { ARN: parameterArn } = stored.Parameter;

    // When KMS decrypts it directly with the parameter's own ARN as the
    // encryption context, as the AWS documentation describes.
    const decrypted = await simAws.kms().decrypt(
      new DecryptCommand({
        CiphertextBlob: ciphertextBlob,
        EncryptionContext: { [parameterArnContextKey]: parameterArn },
      }),
    );

    // Then it decrypts, and the same ciphertext claimed as another parameter
    // does not: Parameter Store binds each value to the parameter it belongs
    // to, so one lifted into another parameter cannot be read.
    assertIdentical(
      Buffer.from(decrypted.Plaintext ?? new Uint8Array()).toString("utf8"),
      "hunter2",
    );

    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().decrypt(
        new DecryptCommand({
          CiphertextBlob: ciphertextBlob,
          EncryptionContext: {
            [parameterArnContextKey]: `${parameterArn}-elsewhere`,
          },
        }),
      ),
    );

    assertInstanceOf(error, Error);
  });

  it("decrypts in a batch read and in a path listing", async () => {
    // Given a SecureString and a String parameter under one path.
    const simAws = await simAwsWithSecret();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-host",
        Type: "String",
        Value: "db.internal",
      }),
    );

    // When both are read in a batch and by path, asking for decryption.
    const batch = await simAws.ssm().getParameters(
      new GetParametersCommand({
        Names: ["/myapp/prod/db-password", "/myapp/prod/db-host"],
        WithDecryption: true,
      }),
    );
    const listed = await simAws.ssm().getParametersByPath(
      new GetParametersByPathCommand({
        Path: "/myapp/prod",
        WithDecryption: true,
      }),
    );

    // Then the secret is plaintext in both, and the flag changed nothing for
    // the parameter that was never encrypted.
    const batched = batch.Parameters ?? [];
    const byPath = listed.Parameters ?? [];

    assertIdentical(batched.at(0)?.Value, "db.internal");
    assertIdentical(batched.at(1)?.Value, "hunter2");
    assertIdentical(byPath.at(0)?.Value, "db.internal");
    assertIdentical(byPath.at(1)?.Value, "hunter2");
  });

  it("leaves a batch read and a path listing encrypted without the flag", async () => {
    // Given a SecureString parameter.
    const simAws = await simAwsWithSecret();

    // When it is read in a batch and by path without asking for decryption.
    const batch = await simAws.ssm().getParameters(
      new GetParametersCommand({
        Names: ["/myapp/prod/db-password"],
      }),
    );
    const listed = await simAws
      .ssm()
      .getParametersByPath(
        new GetParametersByPathCommand({ Path: "/myapp/prod" }),
      );

    // Then neither carries the plaintext.
    assertStringNotIncludes(String(batch.Parameters?.at(0)?.Value), "hunter2");
    assertStringNotIncludes(String(listed.Parameters?.at(0)?.Value), "hunter2");
  });
});
