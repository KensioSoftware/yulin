import {
  CreateSecretCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimSecretsManagerInvalidParameterException } from "../../error/sim-secrets-manager.error.js";
import type { SimSecretsManagerSecretListEntry } from "./secret.command.js";

async function simAwsWithSecrets(...names: readonly string[]): Promise<SimAws> {
  const simAws = new SimAws();

  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop
    await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: name, SecretString: "hunter2" }),
      );
  }

  return simAws;
}

function namesIn(
  secretList: readonly SimSecretsManagerSecretListEntry[],
): readonly string[] {
  return secretList.map((entry) => entry.Name ?? "");
}

describe("Secrets Manager ListSecrets", () => {
  it("lists the secrets in this scope in creation order", async () => {
    // Given three secrets.
    const simAws = await simAwsWithSecrets("first", "second", "third");

    // When they are listed.
    const listed = await simAws
      .secretsManager()
      .listSecrets(new ListSecretsCommand({}));

    // Then all three come back, in the order they were created.
    assertNonNullable(listed.SecretList);
    assertArrayEquals(namesIn(listed.SecretList), ["first", "second", "third"]);
    assertUndefined(listed.NextToken);
  });

  it("reports each secret's versions and staging labels", async () => {
    // Given one secret.
    const simAws = await simAwsWithSecrets("only");

    // When it is listed.
    const listed = await simAws
      .secretsManager()
      .listSecrets(new ListSecretsCommand({}));

    // Then its version staging labels come back under the ListSecrets name for
    // them.
    const entry = listed.SecretList?.at(0);
    assertNonNullable(entry);
    assertNonNullable(entry.SecretVersionsToStages);
    assertArrayEquals(Object.values(entry.SecretVersionsToStages).flat(), [
      "AWSCURRENT",
    ]);
  });

  it("leaves out secrets scheduled for deletion", async () => {
    // Given two secrets, one of them scheduled for deletion.
    const simAws = await simAwsWithSecrets("live", "going");
    await simAws
      .secretsManager()
      .deleteSecret(new DeleteSecretCommand({ SecretId: "going" }));

    // When they are listed.
    const listed = await simAws
      .secretsManager()
      .listSecrets(new ListSecretsCommand({}));

    // Then only the live one is reported, as on real AWS.
    assertNonNullable(listed.SecretList);
    assertArrayEquals(namesIn(listed.SecretList), ["live"]);
  });

  it("includes secrets scheduled for deletion when asked", async () => {
    // Given two secrets, one of them scheduled for deletion.
    const simAws = await simAwsWithSecrets("live", "going");
    await simAws
      .secretsManager()
      .deleteSecret(new DeleteSecretCommand({ SecretId: "going" }));

    // When they are listed with planned deletions included.
    const listed = await simAws
      .secretsManager()
      .listSecrets(new ListSecretsCommand({ IncludePlannedDeletion: true }));

    // Then both come back, and the scheduled one carries its deletion date.
    assertNonNullable(listed.SecretList);
    assertArrayEquals(namesIn(listed.SecretList), ["live", "going"]);
    assertNonNullable(listed.SecretList.at(1)?.DeletedDate);
  });

  it("pages with MaxResults and NextToken", async () => {
    // Given three secrets.
    const simAws = await simAwsWithSecrets("first", "second", "third");

    // When they are listed two at a time.
    const firstPage = await simAws
      .secretsManager()
      .listSecrets(new ListSecretsCommand({ MaxResults: 2 }));
    assertIdentical(firstPage.NextToken, "2");

    const secondPage = await simAws.secretsManager().listSecrets(
      new ListSecretsCommand({
        MaxResults: 2,
        NextToken: firstPage.NextToken,
      }),
    );

    // Then the pages divide the secrets between them and the last has no
    // continuation token.
    assertNonNullable(firstPage.SecretList);
    assertNonNullable(secondPage.SecretList);
    assertArrayLength(firstPage.SecretList, 2);
    assertArrayEquals(namesIn(secondPage.SecretList), ["third"]);
    assertUndefined(secondPage.NextToken);
  });

  it("refuses a MaxResults outside the allowed range", async () => {
    // Given a simulated AWS.
    const simAws = await simAwsWithSecrets("only");

    // When a page size Secrets Manager does not allow is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .listSecrets(new ListSecretsCommand({ MaxResults: 0 })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
  });

  it("refuses a continuation token it did not issue", async () => {
    // Given a simulated AWS.
    const simAws = await simAwsWithSecrets("only");

    // When a token of some other shape is presented.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .listSecrets(new ListSecretsCommand({ NextToken: "not-a-token" })),
    );

    // Then it is refused rather than quietly starting from the beginning.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
  });

  it("refuses filters, which are not simulated", async () => {
    // Given a simulated AWS.
    const simAws = await simAwsWithSecrets("only");

    // When a filter is supplied.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().listSecrets(
        new ListSecretsCommand({
          Filters: [{ Key: "name", Values: ["only"] }],
        }),
      ),
    );

    // Then it is refused rather than quietly returning an unfiltered list.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
  });

  it("refuses a continuation token past the end of the list", async () => {
    // Given two secrets.
    const simAws = await simAwsWithSecrets("first", "second");

    // When a canonical token is presented whose offset is past the end, which
    // is one this command never issues.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .listSecrets(new ListSecretsCommand({ NextToken: "5" })),
    );

    // Then it is refused rather than answered with an empty page.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
  });

  it("refuses a sort order, which is not simulated", async () => {
    // Given a simulated AWS.
    const simAws = await simAwsWithSecrets("only");

    // When a sort order is supplied.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .listSecrets(new ListSecretsCommand({ SortOrder: "desc" })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
  });

  it("refuses a sort field, which is not simulated", async () => {
    // Given a simulated AWS.
    const simAws = await simAwsWithSecrets("only");

    // When a sort field is supplied.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .listSecrets(new ListSecretsCommand({ SortBy: "name" })),
    );

    // Then it is refused rather than quietly returning creation order.
    assertInstanceOf(error, SimSecretsManagerInvalidParameterException);
  });

  it("lists nothing in an empty scope", async () => {
    // Given a simulation with no secrets.
    const simAws = new SimAws();

    // When ListSecrets is called with no input at all.
    const listed = await simAws.secretsManager().listSecrets({});

    // Then the list is empty.
    assertNonNullable(listed.SecretList);
    assertArrayLength(listed.SecretList, 0);
  });
});
