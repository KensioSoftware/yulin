import {
  CreateSecretCommand,
  DescribeSecretCommand,
  PutSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimSecretsManagerInvalidParameterException,
  SimSecretsManagerResourceExistsException,
  SimSecretsManagerResourceNotFoundException,
} from "../../error/sim-secrets-manager.error.js";

describe("Secrets Manager secret names", () => {
  it("refuses a name that is already taken", async () => {
    // Given a secret that already exists.
    const simAws = new SimAws();
    await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "taken", SecretString: "hunter2" }),
      );

    // When another secret is created with the same name.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .createSecret(
          new CreateSecretCommand({ Name: "taken", SecretString: "other" }),
        ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSecretsManagerResourceExistsException);
  });

  it("refuses a name ending in a hyphen and six characters", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a secret is named the way AWS advises against, because it is
    // ambiguous with the suffix Secrets Manager appends to an ARN.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().createSecret(
        new CreateSecretCommand({
          Name: "db-creds-AbCdEf",
          SecretString: "x",
        }),
      ),
    );

    // Then it is refused rather than resolved wrongly later.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
    assertStringIncludes(error.message, "ambiguous");
  });

  it("refuses a name with characters Secrets Manager does not allow", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a secret name contains a character outside the allowed set.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .createSecret(
          new CreateSecretCommand({ Name: "bad name", SecretString: "x" }),
        ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
  });

  it("refuses a name longer than Secrets Manager allows", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a secret name is longer than 512 characters.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .createSecret(
          new CreateSecretCommand({ Name: "a".repeat(513), SecretString: "x" }),
        ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
  });

  it("requires a name", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a secret is created with no name.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().createSecret({ input: { SecretString: "x" } }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
  });
});

describe("Secrets Manager secret values", () => {
  it("refuses a write carrying neither a string nor binary", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a secret is created with no value at all.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .createSecret(new CreateSecretCommand({ Name: "empty" })),
    );

    // Then it is refused, as real Secrets Manager requires one of them.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
  });

  it("refuses a write carrying both a string and binary", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a secret is created with both forms of value.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().createSecret(
        new CreateSecretCommand({
          Name: "both",
          SecretString: "hunter2",
          SecretBinary: Uint8Array.from([1]),
        }),
      ),
    );

    // Then it is refused: the two are mutually exclusive.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
  });

  it("refuses an empty list of version stages", async () => {
    // Given a secret.
    const simAws = new SimAws();
    await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "staged", SecretString: "hunter2" }),
      );

    // When a version is written with no staging labels at all.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().putSecretValue(
        new PutSecretValueCommand({
          SecretId: "staged",
          SecretString: "next",
          VersionStages: [],
        }),
      ),
    );

    // Then it is refused: a version with no label is unreachable.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
  });
});

describe("Secrets Manager unknown secrets", () => {
  it("reports a secret that does not exist", async () => {
    // Given a simulated AWS with no secrets.
    const simAws = new SimAws();

    // When one is described.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .describeSecret(new DescribeSecretCommand({ SecretId: "missing" })),
    );

    // Then Secrets Manager says it cannot find it.
    assertInstanceOf(error, SimSecretsManagerResourceNotFoundException);
  });

  it("requires a SecretId", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When an operation names no secret at all.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().describeSecret({ input: {} }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
  });
});
