import {
  CancelKeyDeletionCommand,
  CreateKeyCommand,
  DescribeKeyCommand,
  DisableKeyCommand,
  EnableKeyCommand,
  EncryptCommand,
  ScheduleKeyDeletionCommand,
} from "@aws-sdk/client-kms";
import {
  assertFalse,
  assertIdentical,
  assertUndefined,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import {
  SimKmsDisabledException,
  SimKmsInvalidStateException,
  SimKmsValidationException,
} from "../../error/sim-kms.error.js";

const plaintext = Uint8Array.from(Buffer.from("hunter2", "utf8"));

async function keyArnFor(simAws: SimAws): Promise<string> {
  const created = await simAws.kms().createKey(new CreateKeyCommand({}));
  assertNonNullable(created.KeyMetadata);
  return created.KeyMetadata.Arn;
}

describe("KMS key state", () => {
  it("refuses to encrypt with a disabled key", async () => {
    // Given a key that has been disabled.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);
    await simAws.kms().disableKey(new DisableKeyCommand({ KeyId: keyArn }));

    // When something tries to encrypt with it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .encrypt(new EncryptCommand({ KeyId: keyArn, Plaintext: plaintext })),
    );

    // Then KMS reports the key as disabled rather than missing.
    assertInstanceOf(error, SimKmsDisabledException);
  });

  it("reports a disabled key as present but not enabled", async () => {
    // Given a key that has been disabled.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);
    await simAws.kms().disableKey(new DisableKeyCommand({ KeyId: keyArn }));

    // When it is described.
    const described = await simAws
      .kms()
      .describeKey(new DescribeKeyCommand({ KeyId: keyArn }));

    // Then it is still there, in the Disabled state.
    assertIdentical(described.KeyMetadata?.KeyState, "Disabled");
    assertFalse(described.KeyMetadata.Enabled);
  });

  it("encrypts again once a disabled key is re-enabled", async () => {
    // Given a key that was disabled and enabled again.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);
    await simAws.kms().disableKey(new DisableKeyCommand({ KeyId: keyArn }));
    await simAws.kms().enableKey(new EnableKeyCommand({ KeyId: keyArn }));

    // When something encrypts with it.
    const encrypted = await simAws
      .kms()
      .encrypt(new EncryptCommand({ KeyId: keyArn, Plaintext: plaintext }));

    // Then it works again.
    assertIdentical(encrypted.KeyId, keyArn);
  });
});

describe("KMS ScheduleKeyDeletion", () => {
  it("schedules deletion a recovery window away rather than deleting", async () => {
    // Given a key and a simulation whose clock is fixed.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-01-01T00:00:00.000Z")),
    });
    const keyArn = await keyArnFor(simAws);

    // When deletion is scheduled with a seven day window.
    const scheduled = await simAws.kms().scheduleKeyDeletion(
      new ScheduleKeyDeletionCommand({
        KeyId: keyArn,
        PendingWindowInDays: 7,
      }),
    );

    // Then the key is pending deletion, due seven days out, and still present.
    assertIdentical(scheduled.KeyState, "PendingDeletion");
    assertIdentical(
      scheduled.DeletionDate?.toISOString(),
      "2026-01-08T00:00:00.000Z",
    );
    assertIdentical(scheduled.PendingWindowInDays, 7);

    const described = await simAws
      .kms()
      .describeKey(new DescribeKeyCommand({ KeyId: keyArn }));
    assertIdentical(described.KeyMetadata?.KeyState, "PendingDeletion");
  });

  it("defaults the recovery window to thirty days", async () => {
    // Given a key in a simulation with a fixed clock.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-01-01T00:00:00.000Z")),
    });
    const keyArn = await keyArnFor(simAws);

    // When deletion is scheduled with no window given.
    const scheduled = await simAws
      .kms()
      .scheduleKeyDeletion(new ScheduleKeyDeletionCommand({ KeyId: keyArn }));

    // Then KMS applies its thirty day default.
    assertIdentical(scheduled.PendingWindowInDays, 30);
    assertIdentical(
      scheduled.DeletionDate?.toISOString(),
      "2026-01-31T00:00:00.000Z",
    );
  });

  it("refuses a recovery window outside the allowed range", async () => {
    // Given a key.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);

    // When a window shorter than KMS allows is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().scheduleKeyDeletion(
        new ScheduleKeyDeletionCommand({
          KeyId: keyArn,
          PendingWindowInDays: 1,
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("refuses to use a key pending deletion", async () => {
    // Given a key scheduled for deletion.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);
    await simAws
      .kms()
      .scheduleKeyDeletion(new ScheduleKeyDeletionCommand({ KeyId: keyArn }));

    // When something tries to encrypt with it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .encrypt(new EncryptCommand({ KeyId: keyArn, Plaintext: plaintext })),
    );

    // Then the invalid state is reported, which is a different failure from a
    // key merely being disabled.
    assertInstanceOf(error, SimKmsInvalidStateException);
  });

  it("refuses to enable a key pending deletion", async () => {
    // Given a key scheduled for deletion.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);
    await simAws
      .kms()
      .scheduleKeyDeletion(new ScheduleKeyDeletionCommand({ KeyId: keyArn }));

    // When something tries to enable it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().enableKey(new EnableKeyCommand({ KeyId: keyArn })),
    );

    // Then it is refused: deletion has to be cancelled first.
    assertInstanceOf(error, SimKmsInvalidStateException);
  });

  it("refuses to disable a key pending deletion", async () => {
    // Given a key scheduled for deletion.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);
    await simAws
      .kms()
      .scheduleKeyDeletion(new ScheduleKeyDeletionCommand({ KeyId: keyArn }));

    // When something tries to disable it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().disableKey(new DisableKeyCommand({ KeyId: keyArn })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsInvalidStateException);
  });
});

describe("KMS CancelKeyDeletion", () => {
  it("returns a key pending deletion to the disabled state", async () => {
    // Given a key scheduled for deletion.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);
    await simAws
      .kms()
      .scheduleKeyDeletion(new ScheduleKeyDeletionCommand({ KeyId: keyArn }));

    // When the deletion is cancelled.
    const cancelled = await simAws
      .kms()
      .cancelKeyDeletion(new CancelKeyDeletionCommand({ KeyId: keyArn }));

    // Then the key is disabled rather than enabled: real KMS makes re-enabling
    // it a separate deliberate step.
    assertIdentical(cancelled.KeyId, keyArn);

    const described = await simAws
      .kms()
      .describeKey(new DescribeKeyCommand({ KeyId: keyArn }));
    assertNonNullable(described.KeyMetadata);
    assertIdentical(described.KeyMetadata.KeyState, "Disabled");
    assertUndefined(described.KeyMetadata.DeletionDate);
  });

  it("refuses to cancel deletion of a key that is not pending", async () => {
    // Given an ordinary enabled key.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);

    // When cancelling deletion is attempted.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .cancelKeyDeletion(new CancelKeyDeletionCommand({ KeyId: keyArn })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsInvalidStateException);
  });
});
