import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { DecryptCommand } from "@aws-sdk/client-kms";
import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";

describe("SSM SecureString under the aws/ssm managed key", () => {
  it("decrypts for a caller holding no KMS permission", async () => {
    // Given a parameter under the managed key.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-password",
        Type: "SecureString",
        Value: "hunter2",
      }),
    );

    // And a Role allowed only ssm:GetParameter.
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "ConfigReader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConfigReader",
        PolicyName: "SsmOnly",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "ssm:GetParameter", Resource: "*" },
        }),
      }),
    );

    // When it reads the parameter with decryption.
    const read = await simAws.ssm().getParameter(
      new GetParameterCommand({
        Name: "/myapp/prod/db-password",
        WithDecryption: true,
      }),
      { caller: { kind: "arn", arn: role.Role.Arn } },
    );

    // Then it gets the plaintext with no kms:Decrypt of its own, because the
    // managed key's policy admits the Account's principals reaching it through
    // Systems Manager. Asking for that grant is what real AWS does not.
    assertIdentical(read.Parameter?.Value, "hunter2");
  });

  it("writes for a caller holding no KMS permission", async () => {
    // Given a Role allowed only ssm:PutParameter.
    const simAws = new SimAws();
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "ConfigReader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConfigReader",
        PolicyName: "SsmOnly",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "ssm:PutParameter", Resource: "*" },
        }),
      }),
    );

    // When it writes a SecureString naming no key of its own.
    const written = await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/api-key",
        Type: "SecureString",
        Value: "secret",
      }),
      { caller: { kind: "arn", arn: role.Role.Arn } },
    );

    // Then the write succeeds: the same rule covers the encrypting side.
    assertIdentical(written.Version, 1);
  });

  it("denies the same caller decrypting the value through KMS", async () => {
    // Given a parameter under the managed key, and a Role allowed only
    // ssm:GetParameter.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-password",
        Type: "SecureString",
        Value: "hunter2",
      }),
    );
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "ConfigReader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConfigReader",
        PolicyName: "SsmOnly",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "ssm:GetParameter", Resource: "*" },
        }),
      }),
    );

    // And that Role reading it as its stored ciphertext.
    const stored = await simAws
      .ssm()
      .getParameter(
        new GetParameterCommand({ Name: "/myapp/prod/db-password" }),
        { caller: { kind: "arn", arn: role.Role.Arn } },
      );
    assertNonNullable(stored.Parameter?.Value);

    // When the Role takes the ciphertext to KMS itself.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().decrypt(
        new DecryptCommand({
          CiphertextBlob: Buffer.from(stored.Parameter?.Value ?? "", "base64"),
        }),
        { caller: { kind: "arn", arn: role.Role.Arn } },
      ),
    );

    // Then it is denied. The managed key is usable through Parameter Store and
    // not otherwise, so the parameter's own permissions stay in charge of it.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
