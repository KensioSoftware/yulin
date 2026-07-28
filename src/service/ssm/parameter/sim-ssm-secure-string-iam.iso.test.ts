import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateKeyCommand } from "@aws-sdk/client-kms";
import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringNotIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";

interface SimAwsWithSecret {
  readonly simAws: SimAws;
  readonly keyArn: string;
  readonly caller: SimAwsCaller;
}

/**
 * A simulated AWS holding one SecureString parameter under a customer managed
 * key, and a Role whose only permissions are the given statements.
 */
async function simAwsWithSecret(
  policyStatements: (accountId: string, keyArn: string) => object,
): Promise<SimAwsWithSecret> {
  const simAws = new SimAws();
  const accountId = simAws.defaultAccountId;

  const key = await simAws
    .kms()
    .createKey(new CreateKeyCommand({ Description: "Parameter key" }));

  assertNonNullable(key.KeyMetadata?.Arn);

  await simAws.ssm().putParameter(
    new PutParameterCommand({
      Name: "/myapp/prod/db-password",
      Type: "SecureString",
      Value: "hunter2",
      KeyId: key.KeyMetadata.Arn,
    }),
  );

  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "ConfigReader",
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

  const policyDocument = JSON.stringify({
    Version: "2012-10-17",
    Statement: policyStatements(accountId, key.KeyMetadata.Arn),
  });

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "ConfigReader",
      PolicyName: "SecretPolicy",
      PolicyDocument: policyDocument,
    }),
  );

  return {
    simAws,
    keyArn: key.KeyMetadata.Arn,
    caller: { kind: "arn", arn: role.Role.Arn },
  };
}

const readParameter = {
  Effect: "Allow",
  Action: "ssm:GetParameter",
  Resource: "*",
};

describe("SSM SecureString IAM authorization", () => {
  it("decrypts for a caller allowed both the parameter and the key", async () => {
    // Given a Role allowed to read the parameter and to decrypt with its key.
    const { simAws, caller } = await simAwsWithSecret((_, keyArn) => [
      readParameter,
      { Effect: "Allow", Action: "kms:Decrypt", Resource: keyArn },
    ]);

    // When it reads the parameter with decryption.
    const read = await simAws.ssm().getParameter(
      new GetParameterCommand({
        Name: "/myapp/prod/db-password",
        WithDecryption: true,
      }),
      { caller },
    );

    // Then it gets the plaintext.
    assertIdentical(read.Parameter?.Value, "hunter2");
  });

  it("denies a decrypting read to a caller with no key permission", async () => {
    // Given a Role allowed to read the parameter but not to use its key.
    const { simAws, caller } = await simAwsWithSecret(() => readParameter);

    // When it reads the parameter with decryption.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().getParameter(
        new GetParameterCommand({
          Name: "/myapp/prod/db-password",
          WithDecryption: true,
        }),
        { caller },
      ),
    );

    // Then it is denied, because kms:Decrypt is a separate permission from
    // ssm:GetParameter and this is the failure a deployment actually hits.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("reads the ciphertext without any key permission", async () => {
    // Given the same Role with no key permission.
    const { simAws, caller } = await simAwsWithSecret(() => readParameter);

    // When it reads the parameter without asking for decryption.
    const read = await simAws
      .ssm()
      .getParameter(
        new GetParameterCommand({ Name: "/myapp/prod/db-password" }),
        { caller },
      );

    // Then the read succeeds, because nothing decrypted, and what comes back
    // is the ciphertext rather than the secret.
    assertStringNotIncludes(String(read.Parameter?.Value), "hunter2");
  });

  it("denies a write to a caller with no key permission", async () => {
    // Given a Role allowed to write parameters but not to use the key.
    const { simAws, keyArn, caller } = await simAwsWithSecret(() => ({
      Effect: "Allow",
      Action: "ssm:PutParameter",
      Resource: "*",
    }));

    // When it writes a SecureString under that key.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name: "/myapp/prod/api-key",
          Type: "SecureString",
          Value: "secret",
          KeyId: keyArn,
        }),
        { caller },
      ),
    );

    // Then it is denied: a standard tier write needs kms:Encrypt as well.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("writes for a caller allowed both the parameter and the key", async () => {
    // Given a Role allowed to write parameters and to encrypt with the key.
    const { simAws, keyArn, caller } = await simAwsWithSecret((_, arn) => [
      { Effect: "Allow", Action: "ssm:PutParameter", Resource: "*" },
      { Effect: "Allow", Action: "kms:Encrypt", Resource: arn },
    ]);

    // When it writes a SecureString under that key.
    const written = await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/api-key",
        Type: "SecureString",
        Value: "secret",
        KeyId: keyArn,
      }),
      { caller },
    );

    // Then the write succeeds.
    assertIdentical(written.Version, 1);
  });

  it("leaves no parameter behind when the key permission is missing", async () => {
    // Given a Role allowed to write parameters but not to use the key.
    const { simAws, keyArn, caller } = await simAwsWithSecret(() => ({
      Effect: "Allow",
      Action: "ssm:PutParameter",
      Resource: "*",
    }));

    // When a create is denied at the encryption step.
    await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name: "/myapp/prod/api-key",
          Type: "SecureString",
          Value: "secret",
          KeyId: keyArn,
        }),
        { caller },
      ),
    );

    // Then no half-made parameter is left in the store.
    assertUndefined(simAws.ssm().findParameter("/myapp/prod/api-key"));
  });
});
