import { DecryptCommand } from "@aws-sdk/client-kms";
import {
  GetParameterCommand,
  GetParametersByPathCommand,
  GetParametersCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringNotIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

/**
 * The parameter these tests read, and the value it holds.
 */
const parameterName = "/myapp/prod/db-password";
const parameterValue = "hunter2";

describe("SSM SecureString under the aws/ssm managed key", () => {
  it("decrypts for a caller holding no KMS permission at all", async () => {
    // Given a parameter under the managed key, and a Role allowed to read
    // parameters and nothing else.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: parameterName,
        Type: "SecureString",
        Value: parameterValue,
      }),
    );
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "ConfigReader", actions: ["ssm:GetParameter"] },
      simAws,
    );

    // When it reads the parameter with decryption.
    const read = await simAws
      .ssm()
      .getParameter(
        new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
        { caller: { kind: "arn", arn: role.Arn } },
      );

    // Then it gets the plaintext, as it does in an account. The managed key's
    // policy grants the cryptographic actions to a wildcard principal under
    // its via-service and caller-account conditions, and Parameter Store
    // satisfies both of them.
    assertIdentical(read.Parameter?.Value, parameterValue);
  });

  it("reads a String parameter for a caller holding no kms:Decrypt", async () => {
    // Given a parameter stored in the clear, and a Role allowed to read
    // parameters and nothing else.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-host",
        Type: "String",
        Value: "db.example.com",
      }),
    );
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "ConfigReader", actions: ["ssm:GetParameter"] },
      simAws,
    );

    // When it reads that parameter, asking for decryption.
    const read = await simAws.ssm().getParameter(
      new GetParameterCommand({
        Name: "/myapp/prod/db-host",
        WithDecryption: true,
      }),
      { caller: { kind: "arn", arn: role.Arn } },
    );

    // Then it reads the value: no key protects it, so there is nothing to be
    // allowed to use, and Parameter Store ignores WithDecryption for it.
    assertIdentical(read.Parameter?.Value, "db.example.com");
  });

  it("reads the ciphertext where the read asks for no decryption", async () => {
    // Given a parameter under the managed key, and a Role allowed to read
    // parameters and nothing else.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: parameterName,
        Type: "SecureString",
        Value: parameterValue,
      }),
    );
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "ConfigReader", actions: ["ssm:GetParameter"] },
      simAws,
    );

    // When it reads the parameter without asking for decryption.
    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: parameterName }), {
        caller: { kind: "arn", arn: role.Arn },
      });

    // Then the read succeeds, because nothing decrypted, and what comes back
    // is the ciphertext rather than the secret.
    assertStringNotIncludes(String(read.Parameter?.Value), parameterValue);
  });

  it("decrypts a batch read for a caller holding no KMS permission", async () => {
    // Given a parameter under the managed key, and a Role allowed to read
    // parameters in batches and nothing else.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: parameterName,
        Type: "SecureString",
        Value: parameterValue,
      }),
    );
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "ConfigReader", actions: ["ssm:GetParameters"] },
      simAws,
    );

    // When it reads the parameter through GetParameters with decryption.
    const read = await simAws.ssm().getParameters(
      new GetParametersCommand({
        Names: [parameterName],
        WithDecryption: true,
      }),
      { caller: { kind: "arn", arn: role.Arn } },
    );

    // Then the batch comes back decrypted, and the name is not reported as one
    // that failed to resolve.
    assertIdentical(read.Parameters?.[0]?.Value, parameterValue);
    assertIdentical(read.InvalidParameters?.length, 0);
  });

  it("decrypts a path listing for a caller holding no KMS permission", async () => {
    // Given a parameter under the managed key, and a Role allowed to list a
    // path and nothing else.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: parameterName,
        Type: "SecureString",
        Value: parameterValue,
      }),
    );
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "ConfigReader", actions: ["ssm:GetParametersByPath"] },
      simAws,
    );

    // When it lists the path the parameter is under, with decryption.
    const listed = await simAws.ssm().getParametersByPath(
      new GetParametersByPathCommand({
        Path: "/myapp/prod",
        WithDecryption: true,
      }),
      { caller: { kind: "arn", arn: role.Arn } },
    );

    // Then the listing decrypts what is under the path, on the parameter
    // permission alone.
    assertIdentical(listed.Parameters?.[0]?.Value, parameterValue);
  });

  it("writes for a caller holding no KMS permission", async () => {
    // Given a Role allowed only ssm:PutParameter.
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "ConfigWriter", actions: ["ssm:PutParameter"] },
      simAws,
    );

    // When it writes a SecureString naming no key of its own.
    const written = await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/api-key",
        Type: "SecureString",
        Value: "secret",
      }),
      { caller: { kind: "arn", arn: role.Arn } },
    );

    // Then the write succeeds.
    assertIdentical(written.Version, 1);
  });

  it("denies the same caller decrypting the value through KMS", async () => {
    // Given a parameter under the managed key, and a Role allowed only
    // ssm:GetParameter.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: parameterName,
        Type: "SecureString",
        Value: parameterValue,
      }),
    );
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "ConfigReader", actions: ["ssm:GetParameter"] },
      simAws,
    );

    // And that Role reading it as its stored ciphertext.
    const stored = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: parameterName }), {
        caller: { kind: "arn", arn: role.Arn },
      });
    const ciphertext = stored.Parameter?.Value;
    assertNonNullable(ciphertext);

    // When the Role takes the ciphertext to KMS itself.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().decrypt(
        new DecryptCommand({
          CiphertextBlob: Buffer.from(ciphertext, "base64"),
        }),
        { caller: { kind: "arn", arn: role.Arn } },
      ),
    );

    // Then it is denied. The managed key is usable through Parameter Store and
    // not otherwise, so the parameter's own permissions stay in charge of it.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
