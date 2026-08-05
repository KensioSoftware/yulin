import {
  CreateSecretCommand,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimSecretsManagerResourceNotFoundException } from "../error/sim-secrets-manager.error.js";

const accountIdOneOnes = "111111111111";

async function simAwsWithSecret(): Promise<SimAws> {
  const simAws = new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
  await simAws
    .secretsManager()
    .createSecret(
      new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
    );
  return simAws;
}

describe("Secrets Manager SecretId resolution", () => {
  it("resolves a friendly name", async () => {
    // Given a secret.
    const simAws = await simAwsWithSecret();

    // When it is read by its bare name.
    const read = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }));

    // Then it resolves.
    assertIdentical(read.SecretString, "hunter2");
  });

  it("resolves a full ARN, suffix and all", async () => {
    // Given a secret and the ARN it was given.
    const simAws = await simAwsWithSecret();
    const secret = simAws.secretsManager().findSecret("db-creds");
    assertNonNullable(secret);

    // When it is read by full ARN.
    const read = await simAws
      .secretsManager()
      .getSecretValue(
        new GetSecretValueCommand({ SecretId: secret.arn.value }),
      );

    // Then it resolves.
    assertIdentical(read.SecretString, "hunter2");
  });

  it("resolves a partial ARN with no suffix", async () => {
    // Given a secret.
    const simAws = await simAwsWithSecret();

    // When it is read by an ARN written without the random suffix, as the AWS
    // console and plenty of templates do.
    const read = await simAws.secretsManager().getSecretValue(
      new GetSecretValueCommand({
        SecretId:
          "arn:aws:secretsmanager:eu-west-2:111111111111:secret:db-creds",
      }),
    );

    // Then it resolves.
    assertIdentical(read.SecretString, "hunter2");
  });

  it("does not resolve an ARN naming another Region", async () => {
    // Given a secret in eu-west-2.
    const simAws = await simAwsWithSecret();

    // When it is named by an ARN in another Region.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().getSecretValue(
        new GetSecretValueCommand({
          SecretId:
            "arn:aws:secretsmanager:us-east-1:111111111111:secret:db-creds",
        }),
      ),
    );

    // Then it is not found, rather than having its name read out and looked up
    // locally.
    assertInstanceOf(error, SimSecretsManagerResourceNotFoundException);
  });

  it("does not resolve an ARN naming another Account", async () => {
    // Given a secret in Account 111111111111.
    const simAws = await simAwsWithSecret();

    // When it is named by an ARN in another Account.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().getSecretValue(
        new GetSecretValueCommand({
          SecretId:
            "arn:aws:secretsmanager:eu-west-2:222222222222:secret:db-creds",
        }),
      ),
    );

    // Then it is not found.
    assertInstanceOf(error, SimSecretsManagerResourceNotFoundException);
  });

  it("does not resolve an ARN of another service", async () => {
    // Given a secret.
    const simAws = await simAwsWithSecret();

    // When something that is an ARN but not a secret ARN is used.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().getSecretValue(
        new GetSecretValueCommand({
          SecretId: "arn:aws:kms:eu-west-2:111111111111:key/db-creds",
        }),
      ),
    );

    // Then it is not found.
    assertInstanceOf(error, SimSecretsManagerResourceNotFoundException);
  });

  it("does not resolve a Secrets Manager ARN of another resource type", async () => {
    // Given a secret.
    const simAws = await simAwsWithSecret();

    // When the ARN names Secrets Manager but not a secret.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().getSecretValue(
        new GetSecretValueCommand({
          SecretId:
            "arn:aws:secretsmanager:eu-west-2:111111111111:rotation:db-creds",
        }),
      ),
    );

    // Then it is not found.
    assertInstanceOf(error, SimSecretsManagerResourceNotFoundException);
  });

  it("does not resolve a malformed ARN", async () => {
    // Given a secret.
    const simAws = await simAwsWithSecret();

    // When an ARN with too few parts is used.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .getSecretValue(
          new GetSecretValueCommand({ SecretId: "arn:aws:secretsmanager" }),
        ),
    );

    // Then it is not found.
    assertInstanceOf(error, SimSecretsManagerResourceNotFoundException);
  });
});

describe("Secrets Manager scoping", () => {
  it("keeps secrets to their own Account and Region", async () => {
    // Given a secret created in one Account and Region.
    const simAws = new SimAws();
    await simAws
      .account("222222222222")
      .region("eu-west-2")
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
      );

    // When another Region is asked for it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .account("222222222222")
        .region("us-east-1")
        .secretsManager()
        .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" })),
    );

    // Then it is not there: a secret name is unique to one Account and Region
    // and nowhere wider.
    assertInstanceOf(error, SimSecretsManagerResourceNotFoundException);

    assertUndefined(
      simAws
        .account("222222222222")
        .region("us-east-1")
        .secretsManager()
        .findSecret("db-creds"),
    );
  });

  it("keeps secrets out of another Account in the same Region", async () => {
    // Given a secret created in one Account.
    const simAws = new SimAws();
    await simAws
      .account("222222222222")
      .region("eu-west-2")
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
      );

    // When another Account in the same Region asks for it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .account("333333333333")
        .region("eu-west-2")
        .secretsManager()
        .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" })),
    );

    // Then it is not there: the Region matching is not enough on its own.
    assertInstanceOf(error, SimSecretsManagerResourceNotFoundException);

    assertUndefined(
      simAws
        .account("333333333333")
        .region("eu-west-2")
        .secretsManager()
        .findSecret("db-creds"),
    );
  });
});
