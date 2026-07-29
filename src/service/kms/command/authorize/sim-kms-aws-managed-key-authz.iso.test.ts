import {
  DecryptCommand,
  DescribeKeyCommand,
  EncryptCommand,
  GetKeyPolicyCommand,
} from "@aws-sdk/client-kms";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

const managedKeyAlias = "alias/aws/ssm";
const plaintext = Uint8Array.from(Buffer.from("hunter2", "utf8"));

describe("KMS AWS managed key authorization", () => {
  it("lets a caller with no KMS permission use the key through its service", async () => {
    // Given a Role allowed to read parameters and nothing else.
    const simAws = new SimAws();
    const roleIam = simAws.account(simAws.defaultAccountId).iam();
    const roleCreation = await roleIam.createRole(
      new CreateRoleCommand({
        RoleName: "Role-ssm-GetParameter",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await roleIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Role-ssm-GetParameter",
        PolicyName: "OnlyPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "ssm:GetParameter", Resource: "*" },
        }),
      }),
    );
    const roleArn = roleCreation.Role.Arn;

    // When a request reaches the aws/ssm key through Systems Manager.
    const encrypted = await simAws
      .kms()
      .encrypt(
        new EncryptCommand({ KeyId: managedKeyAlias, Plaintext: plaintext }),
        {
          caller: { kind: "arn", arn: roleArn },
          viaService: "ssm",
        },
      );

    // Then the key policy admits it on its own, which is why a Role holding
    // only ssm:GetParameter reads a SecureString on real AWS.
    assertNonNullable(encrypted.KeyId);
  });

  it("denies a caller reaching the key directly, despite an identity grant", async () => {
    // Given a Role IAM allows kms:Decrypt on everything, and a ciphertext made
    // through the owning service.
    const simAws = new SimAws();
    const roleIam = simAws.account(simAws.defaultAccountId).iam();
    const roleCreation = await roleIam.createRole(
      new CreateRoleCommand({
        RoleName: "Role-kms-Decrypt",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await roleIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Role-kms-Decrypt",
        PolicyName: "OnlyPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "kms:Decrypt", Resource: "*" },
        }),
      }),
    );
    const roleArn = roleCreation.Role.Arn;

    const encrypted = await simAws
      .kms()
      .encrypt(
        new EncryptCommand({ KeyId: managedKeyAlias, Plaintext: plaintext }),
        { viaService: "ssm" },
      );

    // When the Role decrypts it by calling KMS itself.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .decrypt(
          new DecryptCommand({ CiphertextBlob: encrypted.CiphertextBlob }),
          { caller: { kind: "arn", arn: roleArn } },
        ),
    );

    // Then it is denied: an AWS managed key policy does not delegate use of
    // the key to IAM, so an identity grant reaches nothing.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "kms:Decrypt");
  });

  it("denies a request that came through a different service", async () => {
    // Given the aws/ssm key.
    const simAws = new SimAws();

    // When a request reaches it through S3 instead.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .encrypt(
          new EncryptCommand({ KeyId: managedKeyAlias, Plaintext: plaintext }),
          { viaService: "s3" },
        ),
    );

    // Then the policy's kms:ViaService condition does not match, and the key
    // stays reachable only through the service that owns it.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies a caller from another Account reaching the key through the service", async () => {
    // Given a Role in another Account whose own IAM allows every KMS action.
    const simAws = new SimAws();
    const roleIam = simAws.account("222222222222").iam();
    const roleCreation = await roleIam.createRole(
      new CreateRoleCommand({
        RoleName: "Role-kms-all",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: "arn:aws:iam::222222222222:root" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await roleIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Role-kms-all",
        PolicyName: "OnlyPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "kms:*", Resource: "*" },
        }),
      }),
    );
    const foreignRoleArn = roleCreation.Role.Arn;

    // When it reaches the key through Systems Manager.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .encrypt(
          new EncryptCommand({ KeyId: managedKeyAlias, Plaintext: plaintext }),
          {
            caller: { kind: "arn", arn: foreignRoleArn },
            viaService: "ssm",
          },
        ),
    );

    // Then the policy's kms:CallerAccount condition refuses it: the key admits
    // its own Account's principals, not everyone using the service.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("lets the Account read the key's metadata but not use it", async () => {
    // Given the aws/ssm key and the Account root, which IAM allows everything.
    const simAws = new SimAws();

    // When the Account describes the key and then tries to encrypt with it.
    const described = await simAws
      .kms()
      .describeKey(new DescribeKeyCommand({ KeyId: managedKeyAlias }));

    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .encrypt(
          new EncryptCommand({ KeyId: managedKeyAlias, Plaintext: plaintext }),
        ),
    );

    // Then the metadata comes back and the encryption does not: the policy
    // delegates reading the key to IAM and nothing more.
    assertIdentical(described.KeyMetadata?.KeyManager, "AWS");
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("gives the key the via-service policy rather than the customer default", async () => {
    // Given the aws/ssm key.
    const simAws = new SimAws();

    // When its policy is read.
    const read = await simAws
      .kms()
      .getKeyPolicy(new GetKeyPolicyCommand({ KeyId: managedKeyAlias }));

    // Then it is the policy real AWS gives an AWS managed key: use of the key
    // scoped to the owning service and the owning Account, and a second
    // statement covering the key's metadata and no more.
    assertNonNullable(read.Policy);
    assertStringIncludes(read.Policy, `"Id":"auto-ssm-1"`);
    assertStringIncludes(read.Policy, `"kms:ViaService":"ssm.us-east-1`);
    assertStringIncludes(
      read.Policy,
      `"kms:CallerAccount":"${simAws.defaultAccountId}"`,
    );
    assertStringIncludes(read.Policy, `"kms:Describe*"`);
  });

  it("refuses a via-service endpoint where a service name is wanted", async () => {
    // Given the aws/ssm key.
    const simAws = new SimAws();

    // When a request names the service by endpoint.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .encrypt(
          new EncryptCommand({ KeyId: managedKeyAlias, Plaintext: plaintext }),
          { viaService: "ssm.us-east-1.amazonaws.com" },
        ),
    );

    // Then it is refused rather than producing a value nothing can match. The
    // region comes from the key, so the caller supplies the service alone.
    assertStringIncludes(error.message, "rather than by endpoint");
  });
});
