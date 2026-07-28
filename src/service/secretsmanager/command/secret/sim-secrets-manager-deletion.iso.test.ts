import {
  CreateSecretCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  RestoreSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import {
  SimSecretsManagerInvalidParameterException,
  SimSecretsManagerInvalidRequestException,
  SimSecretsManagerResourceNotFoundException,
} from "../../error/sim-secrets-manager.error.js";

const startOfYear = new Date("2026-01-01T00:00:00.000Z");

async function simAwsWithSecret(name: string): Promise<SimAws> {
  const simAws = new SimAws({ clock: new SimFixedClock(startOfYear) });
  await simAws
    .secretsManager()
    .createSecret(
      new CreateSecretCommand({ Name: name, SecretString: "hunter2" }),
    );
  return simAws;
}

describe("Secrets Manager DeleteSecret", () => {
  it("schedules deletion a recovery window away rather than deleting", async () => {
    // Given a secret in a simulation whose clock starts at a known instant.
    const simAws = await simAwsWithSecret("db-creds");

    // When it is deleted with a seven day recovery window.
    const deleted = await simAws.secretsManager().deleteSecret(
      new DeleteSecretCommand({
        SecretId: "db-creds",
        RecoveryWindowInDays: 7,
      }),
    );

    // Then it is due to go seven days out, and it is still describable.
    assertIdentical(
      deleted.DeletionDate?.toISOString(),
      "2026-01-08T00:00:00.000Z",
    );

    const described = await simAws
      .secretsManager()
      .describeSecret(new DescribeSecretCommand({ SecretId: "db-creds" }));

    assertIdentical(
      described.DeletedDate?.toISOString(),
      "2026-01-08T00:00:00.000Z",
    );
  });

  it("defaults the recovery window to thirty days", async () => {
    // Given a secret.
    const simAws = await simAwsWithSecret("db-creds");

    // When it is deleted with no window given.
    const deleted = await simAws
      .secretsManager()
      .deleteSecret(new DeleteSecretCommand({ SecretId: "db-creds" }));

    // Then Secrets Manager applies its thirty day default.
    assertIdentical(
      deleted.DeletionDate?.toISOString(),
      "2026-01-31T00:00:00.000Z",
    );
  });

  it("refuses to read a secret that is scheduled for deletion", async () => {
    // Given a secret scheduled for deletion.
    const simAws = await simAwsWithSecret("db-creds");
    await simAws
      .secretsManager()
      .deleteSecret(new DeleteSecretCommand({ SecretId: "db-creds" }));

    // When something tries to read its value.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" })),
    );

    // Then the request is refused because of the secret's state.
    assertInstanceOf(error, SimSecretsManagerInvalidRequestException);
  });

  it("refuses to write a secret that is scheduled for deletion", async () => {
    // Given a secret scheduled for deletion.
    const simAws = await simAwsWithSecret("db-creds");
    await simAws
      .secretsManager()
      .deleteSecret(new DeleteSecretCommand({ SecretId: "db-creds" }));

    // When something tries to put a new value.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().putSecretValue(
        new PutSecretValueCommand({
          SecretId: "db-creds",
          SecretString: "next",
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSecretsManagerInvalidRequestException);
  });

  it("keeps the name taken until the window elapses", async () => {
    // Given a secret scheduled for deletion.
    const simAws = await simAwsWithSecret("db-creds");
    await simAws
      .secretsManager()
      .deleteSecret(new DeleteSecretCommand({ SecretId: "db-creds" }));

    // When a secret of the same name is created again.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .createSecret(
          new CreateSecretCommand({ Name: "db-creds", SecretString: "new" }),
        ),
    );

    // Then it is refused, which is the failure a redeployed stack actually
    // hits on real AWS.
    assertInstanceOf(error, SimSecretsManagerInvalidRequestException);
  });

  it("frees the name once simulated time passes the window", async () => {
    // Given a secret scheduled for deletion with a seven day window.
    const simAws = await simAwsWithSecret("db-creds");
    await simAws.secretsManager().deleteSecret(
      new DeleteSecretCommand({
        SecretId: "db-creds",
        RecoveryWindowInDays: 7,
      }),
    );

    // When the simulation's clock moves past the window.
    await simAws.clock().advanceBy({ days: 8 });

    // Then the secret is gone and the name can be used again.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .describeSecret(new DescribeSecretCommand({ SecretId: "db-creds" })),
    );
    assertInstanceOf(error, SimSecretsManagerResourceNotFoundException);

    const recreated = await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "db-creds", SecretString: "new" }),
      );
    assertNonNullable(recreated.ARN);
  });

  it("leaves a restored secret alone when its old window elapses", async () => {
    // Given a secret that was scheduled for deletion and then restored.
    const simAws = await simAwsWithSecret("db-creds");
    await simAws.secretsManager().deleteSecret(
      new DeleteSecretCommand({
        SecretId: "db-creds",
        RecoveryWindowInDays: 7,
      }),
    );
    await simAws
      .secretsManager()
      .restoreSecret(new RestoreSecretCommand({ SecretId: "db-creds" }));

    // When the clock passes the window that deletion would have run out on.
    await simAws.clock().advanceBy({ days: 8 });

    // Then the secret is still there.
    const read = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }));
    assertIdentical(read.SecretString, "hunter2");
  });

  it("refuses to schedule a deletion twice", async () => {
    // Given a secret already scheduled for deletion.
    const simAws = await simAwsWithSecret("db-creds");
    await simAws
      .secretsManager()
      .deleteSecret(new DeleteSecretCommand({ SecretId: "db-creds" }));

    // When it is deleted again.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .deleteSecret(new DeleteSecretCommand({ SecretId: "db-creds" })),
    );

    // Then it is refused rather than quietly moving the deletion date.
    assertInstanceOf(error, SimSecretsManagerInvalidRequestException);
  });

  it("refuses a recovery window outside the allowed range", async () => {
    // Given a secret.
    const simAws = await simAwsWithSecret("db-creds");

    // When a window shorter than Secrets Manager allows is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().deleteSecret(
        new DeleteSecretCommand({
          SecretId: "db-creds",
          RecoveryWindowInDays: 1,
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
  });
});

describe("Secrets Manager ForceDeleteWithoutRecovery", () => {
  it("deletes the secret at once and frees the name", async () => {
    // Given a secret.
    const simAws = await simAwsWithSecret("db-creds");

    // When it is force deleted.
    await simAws.secretsManager().deleteSecret(
      new DeleteSecretCommand({
        SecretId: "db-creds",
        ForceDeleteWithoutRecovery: true,
      }),
    );

    // Then it is gone straight away and the name is free.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .describeSecret(new DescribeSecretCommand({ SecretId: "db-creds" })),
    );
    assertInstanceOf(error, SimSecretsManagerResourceNotFoundException);

    const recreated = await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "db-creds", SecretString: "new" }),
      );
    assertNonNullable(recreated.ARN);
  });

  it("refuses a recovery window alongside a forced deletion", async () => {
    // Given a secret.
    const simAws = await simAwsWithSecret("db-creds");

    // When both a forced deletion and a recovery window are asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().deleteSecret(
        new DeleteSecretCommand({
          SecretId: "db-creds",
          ForceDeleteWithoutRecovery: true,
          RecoveryWindowInDays: 7,
        }),
      ),
    );

    // Then the contradiction is refused, as real AWS refuses it.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
  });
});

describe("Secrets Manager RestoreSecret", () => {
  it("takes back a scheduled deletion", async () => {
    // Given a secret scheduled for deletion.
    const simAws = await simAwsWithSecret("db-creds");
    await simAws
      .secretsManager()
      .deleteSecret(new DeleteSecretCommand({ SecretId: "db-creds" }));

    // When it is restored.
    const restored = await simAws
      .secretsManager()
      .restoreSecret(new RestoreSecretCommand({ SecretId: "db-creds" }));

    // Then it is readable again and no longer reports a deletion date.
    assertIdentical(restored.Name, "db-creds");

    const described = await simAws
      .secretsManager()
      .describeSecret(new DescribeSecretCommand({ SecretId: "db-creds" }));
    assertUndefined(described.DeletedDate);

    const read = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }));
    assertIdentical(read.SecretString, "hunter2");
  });

  it("accepts a restore of a secret that was never deleted", async () => {
    // Given an ordinary secret.
    const simAws = await simAwsWithSecret("db-creds");

    // When it is restored anyway.
    const restored = await simAws
      .secretsManager()
      .restoreSecret(new RestoreSecretCommand({ SecretId: "db-creds" }));

    // Then it is a no-op rather than a failure, as on real AWS.
    assertIdentical(restored.Name, "db-creds");
  });
});
