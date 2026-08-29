import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateKeyCommand } from "@aws-sdk/client-kms";
import { PutParameterCommand } from "@aws-sdk/client-ssm";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";

describe("SSM SecureString write IAM authorization", () => {
  it("denies a write to a caller with no key permission", async () => {
    // Given a customer managed key.
    const simAws = new SimAws();
    const key = await simAws
      .kms()
      .createKey(new CreateKeyCommand({ Description: "Parameter key" }));
    assertNonNullable(key.KeyMetadata?.Arn);

    // And a Role allowed to write parameters but not to use the key.
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
          Statement: { Action: "ssm:PutParameter", Resource: "*" },
        }),
      }),
    );

    // When it writes a SecureString under that key.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name: "/myapp/prod/api-key",
          Type: "SecureString",
          Value: "secret",
          KeyId: key.KeyMetadata?.Arn,
        }),
        { caller: { kind: "arn", arn: role.Role.Arn } },
      ),
    );

    // Then it is denied: a standard tier write needs kms:Encrypt as well.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("writes for a caller allowed both the parameter and the key", async () => {
    // Given a customer managed key.
    const simAws = new SimAws();
    const key = await simAws
      .kms()
      .createKey(new CreateKeyCommand({ Description: "Parameter key" }));
    assertNonNullable(key.KeyMetadata?.Arn);

    // And a Role allowed to write parameters and to encrypt with the key.
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
            { Effect: "Allow", Action: "ssm:PutParameter", Resource: "*" },
            {
              Effect: "Allow",
              Action: "kms:Encrypt",
              Resource: key.KeyMetadata.Arn,
            },
          ],
        }),
      }),
    );

    // When it writes a SecureString under that key.
    const written = await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/api-key",
        Type: "SecureString",
        Value: "secret",
        KeyId: key.KeyMetadata.Arn,
      }),
      { caller: { kind: "arn", arn: role.Role.Arn } },
    );

    // Then the write succeeds.
    assertIdentical(written.Version, 1);
  });

  it("leaves no parameter behind when the key permission is missing", async () => {
    // Given a customer managed key.
    const simAws = new SimAws();
    const key = await simAws
      .kms()
      .createKey(new CreateKeyCommand({ Description: "Parameter key" }));
    assertNonNullable(key.KeyMetadata?.Arn);

    // And a Role allowed to write parameters but not to use the key.
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
          Statement: { Action: "ssm:PutParameter", Resource: "*" },
        }),
      }),
    );

    // When a create is denied at the encryption step.
    await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name: "/myapp/prod/api-key",
          Type: "SecureString",
          Value: "secret",
          KeyId: key.KeyMetadata?.Arn,
        }),
        { caller: { kind: "arn", arn: role.Role.Arn } },
      ),
    );

    // Then no half-made parameter is left in the store.
    assertUndefined(simAws.ssm().findParameter("/myapp/prod/api-key"));
  });
});
