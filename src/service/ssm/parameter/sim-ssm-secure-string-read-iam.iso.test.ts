import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateKeyCommand } from "@aws-sdk/client-kms";
import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";
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
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

describe("SSM SecureString read IAM authorization", () => {
  it("decrypts for a caller allowed both the parameter and the key", async () => {
    // Given a SecureString parameter under a customer managed key.
    const simAws = new SimAws();
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

    // And a Role allowed to read the parameter and to decrypt with its key.
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
        PolicyName: "SecretPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: [
            { Effect: "Allow", Action: "ssm:GetParameter", Resource: "*" },
            {
              Effect: "Allow",
              Action: "kms:Decrypt",
              Resource: key.KeyMetadata.Arn,
            },
          ],
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

    // Then it gets the plaintext.
    assertIdentical(read.Parameter?.Value, "hunter2");
  });

  it("decrypts for a caller the key policy names and IAM allows nothing", async () => {
    // Given a Role allowed to read and write parameters and no KMS action.
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "ConfigReader",
        actions: ["ssm:GetParameter", "ssm:PutParameter"],
      },
      simAws,
    );

    // And a customer managed key whose own policy names that Role.
    const key = await simAws.kms().createKey(
      new CreateKeyCommand({
        Policy: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: role.Arn },
            Action: ["kms:Encrypt", "kms:Decrypt"],
            Resource: "*",
          },
        }),
      }),
    );
    assertNonNullable(key.KeyMetadata?.Arn);

    // When the Role stores a SecureString under it and reads it back.
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-password",
        Type: "SecureString",
        Value: "hunter2",
        KeyId: key.KeyMetadata.Arn,
      }),
      { caller: { kind: "arn", arn: role.Arn } },
    );
    const read = await simAws.ssm().getParameter(
      new GetParameterCommand({
        Name: "/myapp/prod/db-password",
        WithDecryption: true,
      }),
      { caller: { kind: "arn", arn: role.Arn } },
    );

    // Then the key policy is enough on its own, as it is on real AWS: a policy
    // naming the caller grants to that caller, and only a policy admitting the
    // Account at large leaves the permission to IAM.
    assertIdentical(read.Parameter?.Value, "hunter2");
  });

  it("decrypts for a caller whose kms:Decrypt is scoped to Systems Manager", async () => {
    // Given a SecureString parameter under a customer managed key.
    const simAws = new SimAws();
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

    // And a Role whose key permission is conditioned on the request reaching
    // KMS through Parameter Store, which is how a stack scopes the grant when
    // the key is chosen after synthesis.
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "ConfigReader", actions: ["ssm:GetParameter"] },
      simAws,
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConfigReader",
        PolicyName: "KeyPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "kms:Decrypt",
            Resource: "*",
            Condition: {
              StringEquals: {
                "kms:ViaService": `ssm.${simAws.defaultRegionName}.amazonaws.com`,
              },
            },
          },
        }),
      }),
    );

    // When it reads the parameter with decryption.
    const read = await simAws.ssm().getParameter(
      new GetParameterCommand({
        Name: "/myapp/prod/db-password",
        WithDecryption: true,
      }),
      { caller: { kind: "arn", arn: role.Arn } },
    );

    // Then the condition matches and the read succeeds, as it does in an
    // account. A check ignoring the condition would refuse a policy real IAM
    // allows.
    assertIdentical(read.Parameter?.Value, "hunter2");
  });

  it("denies a decrypting read to a caller with no key permission", async () => {
    // Given a SecureString parameter under a customer managed key.
    const simAws = new SimAws();
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

    // And a Role allowed to read the parameter but not to use its key.
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
        PolicyName: "SecretPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "ssm:GetParameter", Resource: "*" },
        }),
      }),
    );

    // When it reads the parameter with decryption.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().getParameter(
        new GetParameterCommand({
          Name: "/myapp/prod/db-password",
          WithDecryption: true,
        }),
        { caller: { kind: "arn", arn: role.Role.Arn } },
      ),
    );

    // Then it is denied, because kms:Decrypt is a separate permission from
    // ssm:GetParameter and this is the failure a deployment actually hits.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("reads the ciphertext without any key permission", async () => {
    // Given a SecureString parameter under a customer managed key.
    const simAws = new SimAws();
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

    // And a Role allowed to read the parameter but not to use its key.
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
        PolicyName: "SecretPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "ssm:GetParameter", Resource: "*" },
        }),
      }),
    );

    // When it reads the parameter without asking for decryption.
    const read = await simAws
      .ssm()
      .getParameter(
        new GetParameterCommand({ Name: "/myapp/prod/db-password" }),
        { caller: { kind: "arn", arn: role.Role.Arn } },
      );

    // Then the read succeeds, because nothing decrypted, and what comes back
    // is the ciphertext rather than the secret.
    assertStringNotIncludes(String(read.Parameter?.Value), "hunter2");
  });
});
