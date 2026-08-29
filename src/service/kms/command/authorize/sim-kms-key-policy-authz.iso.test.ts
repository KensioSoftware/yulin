import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateKeyCommand,
  DecryptCommand,
  EncryptCommand,
} from "@aws-sdk/client-kms";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

const plaintext = Uint8Array.from(Buffer.from("hunter2", "utf8"));

/**
 * A Role with no permissions of its own, assumable by the Account.
 */
async function makeRole(
  simAws: SimAws,
  accountId: SimAwsAccountId,
  roleName: string,
): Promise<string> {
  const created = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: roleName,
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

  return created.Role.Arn;
}

async function allowKmsAction(
  simAws: SimAws,
  roleName: string,
  action: string,
): Promise<void> {
  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: `${action.replace(":", "-")}-policy`,
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: { Effect: "Allow", Action: action, Resource: "*" },
      }),
    }),
  );
}

describe("KMS key policy authorization", () => {
  it("lets a Role use a key when the default key policy is in place", async () => {
    // Given a key with the default policy, and a Role allowed kms:Encrypt.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const roleArn = await makeRole(simAws, accountId, "Encrypter");
    await allowKmsAction(simAws, "Encrypter", "kms:Encrypt");

    const created = await simAws.kms().createKey(new CreateKeyCommand({}));
    assertNonNullable(created.KeyMetadata);

    // When the Role encrypts under the key.
    const encrypted = await simAws.kms().encrypt(
      new EncryptCommand({
        KeyId: created.KeyMetadata.Arn,
        Plaintext: plaintext,
      }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then the default key policy delegates to IAM, and IAM allows it.
    assertIdentical(encrypted.KeyId, created.KeyMetadata.Arn);
  });

  it("denies a Role that IAM does not allow, despite the default key policy", async () => {
    // Given a key with the default policy and a Role with no KMS permissions.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const roleArn = await makeRole(simAws, accountId, "NoPermissions");
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));
    assertNonNullable(created.KeyMetadata);

    // When the Role tries to encrypt.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().encrypt(
        new EncryptCommand({
          KeyId: created.KeyMetadata?.Arn,
          Plaintext: plaintext,
        }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then it is denied: delegating to IAM is not the same as granting.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "kms:Encrypt");
  });

  it("denies a Role IAM allows when the key policy does not permit it", async () => {
    // Given a key whose policy names only one other Role, and a second Role
    // that IAM does allow kms:Encrypt.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const permittedArn = await makeRole(simAws, accountId, "Permitted");
    const outsiderArn = await makeRole(simAws, accountId, "Outsider");
    await allowKmsAction(simAws, "Outsider", "kms:Encrypt");

    const created = await simAws.kms().createKey(
      new CreateKeyCommand({
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: permittedArn },
              Action: "kms:*",
              Resource: "*",
            },
          ],
        }),
      }),
    );
    assertNonNullable(created.KeyMetadata);

    // When the Role IAM allows tries to use the key.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().encrypt(
        new EncryptCommand({
          KeyId: created.KeyMetadata?.Arn,
          Plaintext: plaintext,
        }),
        { caller: { kind: "arn", arn: outsiderArn } },
      ),
    );

    // Then the key policy refuses it. This is the KMS rule worth testing: an
    // identity policy cannot reach a key its policy does not admit.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("lets a key policy grant a Role access with no identity policy", async () => {
    // Given a key whose policy names a Role directly, and that Role has no
    // permissions of its own.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const roleArn = await makeRole(simAws, accountId, "NamedInKeyPolicy");

    const created = await simAws.kms().createKey(
      new CreateKeyCommand({
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: roleArn },
              Action: ["kms:Encrypt", "kms:Decrypt"],
              Resource: "*",
            },
          ],
        }),
      }),
    );
    assertNonNullable(created.KeyMetadata);

    // When the Role encrypts and decrypts.
    const encrypted = await simAws.kms().encrypt(
      new EncryptCommand({
        KeyId: created.KeyMetadata.Arn,
        Plaintext: plaintext,
      }),
      { caller: { kind: "arn", arn: roleArn } },
    );
    const decrypted = await simAws
      .kms()
      .decrypt(
        new DecryptCommand({ CiphertextBlob: encrypted.CiphertextBlob }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      );

    // Then the key policy alone is enough, as it is on real AWS.
    const roundTripped = Buffer.from(decrypted.Plaintext ?? new Uint8Array());
    assertIdentical(roundTripped.toString("utf8"), "hunter2");
  });

  it("refuses a wildcard ARN principal to a caller passing its own permissions", async () => {
    // Given a key whose policy names a set of Roles with a wildcard, and a
    // Role in that set holding no permissions of its own.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const roleArn = await makeRole(simAws, accountId, "MatchedByWildcard");

    const created = await simAws.kms().createKey(
      new CreateKeyCommand({
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: `arn:aws:iam::${accountId}:role/*` },
              Action: "kms:Encrypt",
              Resource: "*",
            },
          ],
        }),
      }),
    );
    assertNonNullable(created.KeyMetadata);

    // When a service reaches the key with that Role's own permissions.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().encrypt(
        new EncryptCommand({
          KeyId: created.KeyMetadata?.Arn,
          Plaintext: plaintext,
        }),
        {
          caller: { kind: "arn", arn: roleArn },
          viaService: "ssm",
          withCallerPermissions: true,
        },
      ),
    );

    // Then the statement admits a set of principals without naming one, and
    // the caller still needs the permission itself. Real IAM accepts no
    // wildcard inside a Principal ARN in the first place.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("authorizes Decrypt against the key the ciphertext names", async () => {
    // Given two keys, and a Role the second key's policy admits but not the
    // first's.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const roleArn = await makeRole(simAws, accountId, "SecondKeyOnly");
    await allowKmsAction(simAws, "SecondKeyOnly", "kms:Decrypt");

    const restricted = await simAws.kms().createKey(
      new CreateKeyCommand({
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: `arn:aws:iam::${accountId}:root` },
              Action: "kms:Encrypt",
              Resource: "*",
            },
          ],
        }),
      }),
    );
    assertNonNullable(restricted.KeyMetadata);

    const encrypted = await simAws.kms().encrypt(
      new EncryptCommand({
        KeyId: restricted.KeyMetadata.Arn,
        Plaintext: plaintext,
      }),
    );

    // When the Role decrypts a ciphertext from the key that does not admit it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .decrypt(
          new DecryptCommand({ CiphertextBlob: encrypted.CiphertextBlob }),
          { caller: { kind: "arn", arn: roleArn } },
        ),
    );

    // Then the denial names that key, even though the caller never named it.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.resource, restricted.KeyMetadata.Arn);
  });

  it("denies CreateKey to a Role IAM does not allow", async () => {
    // Given a Role with no KMS permissions.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const roleArn = await makeRole(simAws, accountId, "NotAKeyCreator");

    // When it tries to create a key.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().createKey(new CreateKeyCommand({}), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then CreateKey is denied by identity policies alone, since there is no
    // key yet to hold a policy.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "kms:CreateKey");
  });
});
