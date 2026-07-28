import {
  CreateKeyCommand,
  EncryptCommand,
  GetKeyPolicyCommand,
  PutKeyPolicyCommand,
} from "@aws-sdk/client-kms";
import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertUndefined,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimKmsValidationException } from "../../error/sim-kms.error.js";

const plaintext = Uint8Array.from(Buffer.from("hunter2", "utf8"));

describe("KMS GetKeyPolicy", () => {
  it("returns the default policy a key is created with", async () => {
    // Given a key created with no policy of its own.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When its policy is read back.
    const policy = await simAws
      .kms()
      .getKeyPolicy(
        new GetKeyPolicyCommand({ KeyId: created.KeyMetadata?.Arn }),
      );

    // Then it is the default policy, delegating to the Account's IAM.
    assertIdentical(policy.PolicyName, "default");
    assertStringIncludes(policy.Policy ?? "", `arn:aws:iam::${accountId}:root`);
  });

  it("refuses a policy name other than default", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When some other policy name is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().getKeyPolicy(
        new GetKeyPolicyCommand({
          KeyId: created.KeyMetadata?.Arn,
          PolicyName: "other",
        }),
      ),
    );

    // Then it is refused: a KMS key has exactly one policy.
    assertInstanceOf(error, SimKmsValidationException);
  });
});

describe("KMS PutKeyPolicy", () => {
  it("can lock the Account out of its own key", async () => {
    // Given a key with the default policy, usable by the Account root.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));
    assertNonNullable(created.KeyMetadata);

    const otherRole = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "SomeoneElse",
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

    // When the policy is replaced with one naming only another principal.
    await simAws.kms().putKeyPolicy(
      new PutKeyPolicyCommand({
        KeyId: created.KeyMetadata.Arn,
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: otherRole.Role.Arn },
              Action: "kms:*",
              Resource: "*",
            },
          ],
        }),
      }),
    );

    // Then the Account root can no longer use the key. This is real KMS
    // behaviour, and the reason the console warns before saving such a policy.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().encrypt(
        new EncryptCommand({
          KeyId: created.KeyMetadata?.Arn,
          Plaintext: plaintext,
        }),
      ),
    );

    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("accepts a policy document object as well as a JSON string", async () => {
    // Given a key.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When a policy is supplied as an object, which is the convenient thing to
    // write from a test.
    await simAws.kms().putKeyPolicy({
      input: {
        KeyId: created.KeyMetadata?.Arn,
        Policy: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: `arn:aws:iam::${accountId}:root` },
              Action: "kms:*",
              Resource: "*",
            },
          ],
        },
      },
    });

    // Then it is stored and read back as JSON.
    const policy = await simAws
      .kms()
      .getKeyPolicy(
        new GetKeyPolicyCommand({ KeyId: created.KeyMetadata?.Arn }),
      );
    assertStringIncludes(policy.Policy ?? "", "kms:*");
  });

  it("refuses a policy that is not valid JSON", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When the policy is not a policy document.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().putKeyPolicy(
        new PutKeyPolicyCommand({
          KeyId: created.KeyMetadata?.Arn,
          Policy: "not json",
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("refuses JSON that is not a policy document", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When the policy is valid JSON but not an object.
    const errors = await Promise.all(
      ["null", "[]", '"a policy"'].map(async (policy) =>
        assertThrowsErrorAsync(async () =>
          simAws.kms().putKeyPolicy(
            new PutKeyPolicyCommand({
              KeyId: created.KeyMetadata?.Arn,
              Policy: policy,
            }),
          ),
        ),
      ),
    );

    // Then each is refused here, rather than failing obscurely later when
    // something tries to evaluate it.
    for (const error of errors) {
      assertInstanceOf(error, SimKmsValidationException);
    }
  });

  it("refuses a missing policy", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When no policy is supplied.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().putKeyPolicy({ input: { KeyId: created.KeyMetadata?.Arn } }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("refuses a policy name other than default", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When some other policy name is named.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().putKeyPolicy(
        new PutKeyPolicyCommand({
          KeyId: created.KeyMetadata?.Arn,
          PolicyName: "other",
          Policy: "{}",
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsValidationException);
  });
});

describe("SimKms.findKey", () => {
  it("finds a key without going through a Command", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));
    assertNonNullable(created.KeyMetadata);

    // When a test reaches for it directly.
    const key = simAws.kms().findKey(created.KeyMetadata.KeyId);

    // Then the stored key comes back, with no authorization involved.
    assertIdentical(key?.arn, created.KeyMetadata.Arn);
    assertUndefined(simAws.kms().findKey("no-such-key"));
  });
});
