import {
  CreateAliasCommand,
  CreateKeyCommand,
  DeleteAliasCommand,
  DescribeKeyCommand,
  ListAliasesCommand,
} from "@aws-sdk/client-kms";
import {
  assertArrayEmpty,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimKmsNotFoundException,
  SimKmsValidationException,
} from "../../error/sim-kms.error.js";
import { SimKms } from "../../sim-kms.js";

async function givenAliasedKey(
  simKms: SimKms,
  aliasName: string,
): Promise<string> {
  const key = await simKms.createKey(new CreateKeyCommand({}));
  assertNonNullable(key.KeyMetadata?.KeyId);
  const keyId = key.KeyMetadata.KeyId;

  await simKms.createAlias(
    new CreateAliasCommand({ AliasName: aliasName, TargetKeyId: keyId }),
  );

  return keyId;
}

describe("KMS DeleteAliasCommand", () => {
  it("removes the alias and leaves the key alone", async () => {
    // Given a key with an alias pointing at it.
    const simKms = new SimKms();
    const keyId = await givenAliasedKey(simKms, "alias/removable");

    // When the alias is deleted.
    await simKms.deleteAlias(
      new DeleteAliasCommand({ AliasName: "alias/removable" }),
    );

    // Then the alias is gone and the key is untouched.
    assertUndefined(simKms.findAlias("alias/removable"));

    const described = await simKms.describeKey(
      new DescribeKeyCommand({ KeyId: keyId }),
    );
    assertNonNullable(described.KeyMetadata);
    assertIdentical(described.KeyMetadata.KeyState, "Enabled");

    const listed = await simKms.listAliases(new ListAliasesCommand({}));
    assertArrayEmpty(listed.Aliases);
  });

  it("frees the alias name for another key", async () => {
    // Given an alias that has been deleted.
    const simKms = new SimKms();
    await givenAliasedKey(simKms, "alias/reusable");
    await simKms.deleteAlias(
      new DeleteAliasCommand({ AliasName: "alias/reusable" }),
    );

    // When a second key claims the same alias name.
    const second = await simKms.createKey(new CreateKeyCommand({}));
    assertNonNullable(second.KeyMetadata?.KeyId);
    await simKms.createAlias(
      new CreateAliasCommand({
        AliasName: "alias/reusable",
        TargetKeyId: second.KeyMetadata.KeyId,
      }),
    );

    // Then it points at the second key.
    assertIdentical(
      simKms.findAlias("alias/reusable")?.targetKeyId,
      second.KeyMetadata.KeyId,
    );
  });

  it("rejects an alias that does not exist", async () => {
    // Given a simulated KMS without the requested alias.
    const simKms = new SimKms();

    // When the missing alias is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simKms.deleteAlias(new DeleteAliasCommand({ AliasName: "alias/absent" })),
    );

    // Then KMS answers with its not-found error.
    assertInstanceOf(error, SimKmsNotFoundException);
  });

  it("refuses an alias reserved for an AWS managed key", async () => {
    // Given a simulated KMS.
    const simKms = new SimKms();

    // When a reserved alias is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simKms.deleteAlias(new DeleteAliasCommand({ AliasName: "alias/aws/s3" })),
    );

    // Then KMS refuses, as a customer cannot remove an AWS managed alias.
    assertInstanceOf(error, SimKmsValidationException);
    assertStringIncludes(error.message, "reserved for AWS managed keys");
  });

  it("rejects a missing required AliasName input", async () => {
    // Given a simulated KMS.
    const simKms = new SimKms();

    // When DeleteAlias is called without its required AliasName.
    const error = await assertThrowsErrorAsync(async () =>
      simKms.deleteAlias(
        // @ts-expect-error -- testing invalid input
        new DeleteAliasCommand({}),
      ),
    );

    // Then request validation identifies the missing input.
    assertStringIncludes(error.message, "AliasName is required");
  });

  it("denies a caller without DeleteAlias permission on the key", async () => {
    // Given a key in a simulation with IAM, whose policy grants the Account
    // root and nobody else.
    const simKms = new SimAws().kms();
    await givenAliasedKey(simKms, "alias/protected");

    // When an anonymous caller deletes the alias.
    const error = await assertThrowsErrorAsync(async () =>
      simKms.deleteAlias(
        new DeleteAliasCommand({ AliasName: "alias/protected" }),
        { caller: { kind: "anonymous" } },
      ),
    );

    // Then IAM denies it, and the alias stays.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "kms:DeleteAlias");
    assertInstanceOf(simKms.findAlias("alias/protected"), Object);
  });
});
