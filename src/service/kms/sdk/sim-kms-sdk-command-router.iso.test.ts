import {
  CancelKeyDeletionCommand,
  CreateAliasCommand,
  DeleteAliasCommand,
  CreateKeyCommand,
  DecryptCommand,
  DescribeKeyCommand,
  DisableKeyCommand,
  EnableKeyCommand,
  EncryptCommand,
  GenerateDataKeyCommand,
  GetKeyPolicyCommand,
  KMSClient,
  ListAliasesCommand,
  ListKeysCommand,
  PutKeyPolicyCommand,
  ScheduleKeyDeletionCommand,
} from "@aws-sdk/client-kms";
import {
  assertArrayEmpty,
  assertArrayIncludesAll,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";

const plaintext = Uint8Array.from(Buffer.from("hunter2", "utf8"));

describe("SimKmsSdkCommandRouter", () => {
  it("names every Command simulated KMS handles", () => {
    // Given a scoped simulated KMS.
    const simAws = new SimAws();

    // When its supported Command names are asked for.
    const names = simAws.kms().sdkCommandRouter().supportedCommandNames();

    // Then each simulated operation is routable by SDK Command name.
    assertArrayIncludesAll(names, [
      "CreateKeyCommand",
      "DescribeKeyCommand",
      "ListKeysCommand",
      "GetKeyPolicyCommand",
      "PutKeyPolicyCommand",
      "EnableKeyCommand",
      "DisableKeyCommand",
      "ScheduleKeyDeletionCommand",
      "CancelKeyDeletionCommand",
      "CreateAliasCommand",
      "DeleteAliasCommand",
      "ListAliasesCommand",
      "EncryptCommand",
      "DecryptCommand",
      "GenerateDataKeyCommand",
    ]);
  });

  it("has no route for a Command simulated KMS does not handle", () => {
    // Given a scoped simulated KMS.
    const simAws = new SimAws();

    // When an unsupported Command name is looked up.
    const route = simAws.kms().sdkCommandRouter().route("CreateGrantCommand");

    // Then there is no route for it.
    assertUndefined(route);
  });

  it("routes every supported Command through an intercepted client", async () => {
    // Given an intercepted KMS SDK client.
    const accountId = makeSimAwsAccountId();
    const simSdk = new SimSdk({
      simAws: new SimAws({ defaultAccountId: accountId }),
    });
    simSdk.intercept(KMSClient);

    const kms = new KMSClient({ region: "us-east-1" });

    // When each supported Command is sent through the SDK.
    const created = await kms.send(
      new CreateKeyCommand({ Description: "Router key" }),
    );
    assertNonNullable(created.KeyMetadata);
    const keyArn = created.KeyMetadata.Arn;

    await kms.send(
      new CreateAliasCommand({
        AliasName: "alias/router",
        TargetKeyId: keyArn,
      }),
    );

    const encrypted = await kms.send(
      new EncryptCommand({ KeyId: "alias/router", Plaintext: plaintext }),
    );
    const decrypted = await kms.send(
      new DecryptCommand({ CiphertextBlob: encrypted.CiphertextBlob }),
    );
    const dataKey = await kms.send(
      new GenerateDataKeyCommand({ KeyId: keyArn, KeySpec: "AES_256" }),
    );

    const described = await kms.send(new DescribeKeyCommand({ KeyId: keyArn }));
    const keys = await kms.send(new ListKeysCommand({}));
    const aliases = await kms.send(new ListAliasesCommand({}));
    const policy = await kms.send(new GetKeyPolicyCommand({ KeyId: keyArn }));

    await kms.send(
      new PutKeyPolicyCommand({
        KeyId: keyArn,
        Policy: policy.Policy,
      }),
    );

    await kms.send(new DeleteAliasCommand({ AliasName: "alias/router" }));
    const aliasesAfterDelete = await kms.send(new ListAliasesCommand({}));

    await kms.send(new DisableKeyCommand({ KeyId: keyArn }));
    await kms.send(new EnableKeyCommand({ KeyId: keyArn }));
    await kms.send(new ScheduleKeyDeletionCommand({ KeyId: keyArn }));
    const cancelled = await kms.send(
      new CancelKeyDeletionCommand({ KeyId: keyArn }),
    );

    // Then each reached simulated KMS and came back with an AWS-shaped result.
    const roundTripped = Buffer.from(decrypted.Plaintext ?? new Uint8Array());
    assertIdentical(roundTripped.toString("utf8"), "hunter2");
    assertIdentical(dataKey.Plaintext?.byteLength, 32);
    assertIdentical(described.KeyMetadata?.Description, "Router key");
    assertArrayLength(keys.Keys ?? [], 1);
    assertArrayLength(aliases.Aliases ?? [], 1);
    assertArrayEmpty(aliasesAfterDelete.Aliases ?? []);
    assertIdentical(cancelled.KeyId, keyArn);

    simSdk.restoreAll();
  });
});
