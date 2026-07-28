import {
  CreateSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimSecretsManagerResourceExistsException,
  SimSecretsManagerResourceNotFoundException,
} from "../../error/sim-secrets-manager.error.js";

async function simAwsWithSecret(name: string, value: string): Promise<SimAws> {
  const simAws = new SimAws();
  await simAws
    .secretsManager()
    .createSecret(new CreateSecretCommand({ Name: name, SecretString: value }));
  return simAws;
}

describe("Secrets Manager GetSecretValue", () => {
  it("returns the current version when no version is named", async () => {
    // Given a secret with one version.
    const simAws = await simAwsWithSecret("db-creds", "hunter2");

    // When it is read with nothing but its name.
    const read = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }));

    // Then the AWSCURRENT version comes back.
    assertIdentical(read.SecretString, "hunter2");
    assertIdentical(read.Name, "db-creds");
    assertArrayEquals(read.VersionStages ?? [], ["AWSCURRENT"]);
    assertNonNullable(read.CreatedDate);
  });

  it("returns a version named by its version id", async () => {
    // Given a secret whose value has been replaced.
    const simAws = await simAwsWithSecret("db-creds", "old");
    const put = await simAws.secretsManager().putSecretValue(
      new PutSecretValueCommand({
        SecretId: "db-creds",
        SecretString: "new",
      }),
    );

    // When the new version is read by id.
    const read = await simAws.secretsManager().getSecretValue(
      new GetSecretValueCommand({
        SecretId: "db-creds",
        VersionId: put.VersionId,
      }),
    );

    // Then that version's value comes back.
    assertIdentical(read.SecretString, "new");
  });

  it("refuses a version id that does not exist", async () => {
    // Given a secret.
    const simAws = await simAwsWithSecret("db-creds", "hunter2");

    // When an unknown version is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().getSecretValue(
        new GetSecretValueCommand({
          SecretId: "db-creds",
          VersionId: "not-a-version",
        }),
      ),
    );

    // Then Secrets Manager says it cannot find that value.
    assertInstanceOf(error, SimSecretsManagerResourceNotFoundException);
  });

  it("refuses a version id whose staging label does not match", async () => {
    // Given a secret with a single current version.
    const simAws = await simAwsWithSecret("db-creds", "hunter2");
    const read = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }));

    // When it is asked for by id under a label it does not carry.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().getSecretValue(
        new GetSecretValueCommand({
          SecretId: "db-creds",
          VersionId: read.VersionId,
          VersionStage: "AWSPREVIOUS",
        }),
      ),
    );

    // Then the request is refused rather than quietly ignoring the label.
    assertInstanceOf(error, SimSecretsManagerResourceNotFoundException);
  });

  it("refuses a staging label nothing carries", async () => {
    // Given a secret with only a current version.
    const simAws = await simAwsWithSecret("db-creds", "hunter2");

    // When AWSPREVIOUS is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().getSecretValue(
        new GetSecretValueCommand({
          SecretId: "db-creds",
          VersionStage: "AWSPREVIOUS",
        }),
      ),
    );

    // Then there is nothing to return.
    assertInstanceOf(error, SimSecretsManagerResourceNotFoundException);
  });
});

describe("Secrets Manager PutSecretValue staging labels", () => {
  it("makes the new version current and demotes the old one", async () => {
    // Given a secret with one version.
    const simAws = await simAwsWithSecret("db-creds", "first");
    const first = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }));

    // When a new value is put.
    const second = await simAws.secretsManager().putSecretValue(
      new PutSecretValueCommand({
        SecretId: "db-creds",
        SecretString: "second",
      }),
    );

    // Then the new version is current and the first is previous.
    assertArrayEquals(second.VersionStages ?? [], ["AWSCURRENT"]);
    assertNonNullable(first.VersionId);
    assertNonNullable(second.VersionId);

    const described = await simAws
      .secretsManager()
      .describeSecret(new DescribeSecretCommand({ SecretId: "db-creds" }));

    assertObjectEquals(described.VersionIdsToStages, {
      [first.VersionId]: ["AWSPREVIOUS"],
      [second.VersionId]: ["AWSCURRENT"],
    });
  });

  it("drops AWSPREVIOUS from the version that no longer holds it", async () => {
    // Given a secret whose value has been written three times.
    const simAws = await simAwsWithSecret("db-creds", "first");
    const first = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }));
    const second = await simAws.secretsManager().putSecretValue(
      new PutSecretValueCommand({
        SecretId: "db-creds",
        SecretString: "second",
      }),
    );

    // When a third value is put.
    const third = await simAws.secretsManager().putSecretValue(
      new PutSecretValueCommand({
        SecretId: "db-creds",
        SecretString: "third",
      }),
    );

    // Then only two versions carry labels: the oldest has none left, so it is
    // no longer reported.
    assertNonNullable(second.VersionId);
    assertNonNullable(third.VersionId);

    const described = await simAws
      .secretsManager()
      .describeSecret(new DescribeSecretCommand({ SecretId: "db-creds" }));

    assertObjectEquals(described.VersionIdsToStages, {
      [second.VersionId]: ["AWSPREVIOUS"],
      [third.VersionId]: ["AWSCURRENT"],
    });
    assertNonNullable(first.VersionId);
  });

  it("attaches a custom staging label without touching AWSCURRENT", async () => {
    // Given a secret with a current version.
    const simAws = await simAwsWithSecret("db-creds", "current");

    // When a version is written under a label of the caller's own.
    await simAws.secretsManager().putSecretValue(
      new PutSecretValueCommand({
        SecretId: "db-creds",
        SecretString: "candidate",
        VersionStages: ["AWSPENDING"],
      }),
    );

    // Then a plain read still gets the current value.
    const current = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }));
    const pending = await simAws.secretsManager().getSecretValue(
      new GetSecretValueCommand({
        SecretId: "db-creds",
        VersionStage: "AWSPENDING",
      }),
    );

    assertIdentical(current.SecretString, "current");
    assertIdentical(pending.SecretString, "candidate");
  });
});

describe("Secrets Manager PutSecretValue request tokens", () => {
  it("ignores a repeated write of the same value under the same token", async () => {
    // Given a secret written with a request token of the caller's choosing.
    const simAws = await simAwsWithSecret("db-creds", "first");
    const first = await simAws.secretsManager().putSecretValue(
      new PutSecretValueCommand({
        SecretId: "db-creds",
        SecretString: "second",
        ClientRequestToken: "retryable",
      }),
    );

    // When the same request is made again, as a retry would.
    const retried = await simAws.secretsManager().putSecretValue(
      new PutSecretValueCommand({
        SecretId: "db-creds",
        SecretString: "second",
        ClientRequestToken: "retryable",
      }),
    );

    // Then it is the same version rather than a new one.
    assertIdentical(retried.VersionId, first.VersionId);
  });

  it("refuses to reuse a token for a different value", async () => {
    // Given a secret version written under a token.
    const simAws = await simAwsWithSecret("db-creds", "first");
    await simAws.secretsManager().putSecretValue(
      new PutSecretValueCommand({
        SecretId: "db-creds",
        SecretString: "second",
        ClientRequestToken: "reused",
      }),
    );

    // When the same token is used for a different value.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().putSecretValue(
        new PutSecretValueCommand({
          SecretId: "db-creds",
          SecretString: "different",
          ClientRequestToken: "reused",
        }),
      ),
    );

    // Then it is refused: a version's value never changes once written.
    assertInstanceOf(error, SimSecretsManagerResourceExistsException);
  });

  it("ignores a repeated write of the same binary value", async () => {
    // Given a secret whose value is binary.
    const simAws = new SimAws();
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "binary-blob",
        SecretBinary: Uint8Array.from([1, 2, 3]),
        ClientRequestToken: "binary-token",
      }),
    );

    // When the same bytes are written again under the same token.
    const retried = await simAws.secretsManager().putSecretValue(
      new PutSecretValueCommand({
        SecretId: "binary-blob",
        SecretBinary: Uint8Array.from([1, 2, 3]),
        ClientRequestToken: "binary-token",
      }),
    );

    // Then it is the same version.
    assertIdentical(retried.VersionId, "binary-token");
  });

  it("refuses a token reused for different bytes of the same length", async () => {
    // Given a secret whose value is binary.
    const simAws = new SimAws();
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "binary-blob",
        SecretBinary: Uint8Array.from([1, 2, 3]),
        ClientRequestToken: "binary-token",
      }),
    );

    // When bytes of the same length but different content are written under
    // the same token.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().putSecretValue(
        new PutSecretValueCommand({
          SecretId: "binary-blob",
          SecretBinary: Uint8Array.from([1, 2, 4]),
          ClientRequestToken: "binary-token",
        }),
      ),
    );

    // Then it is refused: the bytes are compared, not just their length.
    assertInstanceOf(error, SimSecretsManagerResourceExistsException);
  });

  it("refuses a token reused for different bytes", async () => {
    // Given a secret whose value is binary.
    const simAws = new SimAws();
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "binary-blob",
        SecretBinary: Uint8Array.from([1, 2, 3]),
        ClientRequestToken: "binary-token",
      }),
    );

    // When different bytes are written under the same token.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().putSecretValue(
        new PutSecretValueCommand({
          SecretId: "binary-blob",
          SecretBinary: Uint8Array.from([9, 9]),
          ClientRequestToken: "binary-token",
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSecretsManagerResourceExistsException);
  });
});
