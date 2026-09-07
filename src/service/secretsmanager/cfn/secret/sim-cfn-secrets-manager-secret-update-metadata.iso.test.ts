import { faker } from "@faker-js/faker";
import { CreateAliasCommand, CreateKeyCommand } from "@aws-sdk/client-kms";
import {
  DescribeSecretCommand,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertNotEqual,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAws } from "../../../aws/sim-aws.js";
import {
  deploySecretStack,
  secretUpdateSimAws,
  updateSecretStack,
} from "./sim-cfn-secrets-manager-secret-update.test-support.js";
import { secretTemplate } from "./sim-cfn-secrets-manager-secret-template.test-support.js";

describe("Secrets Manager CloudFormation Secret update metadata", () => {
  const secretName = (): string => `edge-credential-${faker.string.uuid()}`;
  const stackName = (): string => `edge-${faker.string.uuid()}`;

  const kmsAlias = async (simAws: SimAws, alias: string): Promise<void> => {
    const key = await simAws.kms().createKey(new CreateKeyCommand({}));

    await simAws.kms().createAlias(
      new CreateAliasCommand({
        AliasName: alias,
        TargetKeyId: key.KeyMetadata?.KeyId,
      }),
    );
  };

  it("applies the tags and the KMS key the new template asks for", async () => {
    // Given a deployed secret with a tag and a customer managed key.
    const simAws = secretUpdateSimAws();
    const name = secretName();
    const stack = stackName();
    await kmsAlias(simAws, "alias/edge");
    await deploySecretStack(
      simAws,
      stack,
      secretTemplate({
        name,
        kmsKeyId: "alias/edge",
        tags: [{ Key: "component", Value: "edge" }],
      }),
    );

    // When the template changes the tag and drops the key.
    await updateSecretStack(
      simAws,
      stack,
      secretTemplate({ name, tags: [{ Key: "component", Value: "origin" }] }),
    );

    // Then the secret carries the new tag and is back on the default key.
    const described = await simAws
      .secretsManager()
      .describeSecret(new DescribeSecretCommand({ SecretId: name }));

    assertArrayEquals(described.Tags ?? [], [
      { Key: "component", Value: "origin" },
    ]);
    assertUndefined(described.KmsKeyId);
  });

  it("moves the secret onto a KMS key the update names", async () => {
    // Given a deployed secret on the default Secrets Manager key.
    const simAws = secretUpdateSimAws();
    const name = secretName();
    const stack = stackName();
    await kmsAlias(simAws, "alias/rotated");
    await deploySecretStack(simAws, stack, secretTemplate({ name }));

    const before = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: name }));

    // When the template puts it on a customer managed key.
    await updateSecretStack(
      simAws,
      stack,
      secretTemplate({ name, kmsKeyId: "alias/rotated" }),
    );

    // Then the secret reports the new key.
    const described = await simAws
      .secretsManager()
      .describeSecret(new DescribeSecretCommand({ SecretId: name }));

    assertIdentical(described.KmsKeyId, "alias/rotated");

    // And the version written under the old key is still readable, as it is on
    // real AWS.
    const after = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: name }));

    assertIdentical(after.SecretString, before.SecretString);
  });

  it("clears a Description the new template leaves out", async () => {
    // Given a deployed secret with a description.
    const simAws = secretUpdateSimAws();
    const name = secretName();
    const stack = stackName();
    await deploySecretStack(
      simAws,
      stack,
      secretTemplate({ name, description: "the edge credential" }),
    );

    // When the template drops it, and changes something else so there is an
    // update to make.
    await updateSecretStack(
      simAws,
      stack,
      secretTemplate({ name, tags: [{ Key: "component", Value: "edge" }] }),
    );

    // Then the secret no longer carries the old description.
    const described = await simAws
      .secretsManager()
      .describeSecret(new DescribeSecretCommand({ SecretId: name }));

    assertIdentical(described.Description, "");
  });

  it("replaces the secret when its Name changes", async () => {
    // Given a deployed secret.
    const simAws = secretUpdateSimAws();
    const name = secretName();
    const renamed = secretName();
    const stack = stackName();
    await deploySecretStack(simAws, stack, secretTemplate({ name }));

    const before = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: name }));

    // When the template renames it, which real CloudFormation replaces for.
    await updateSecretStack(simAws, stack, secretTemplate({ name: renamed }));

    // Then a different secret is deployed under the new name.
    const after = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: renamed }));

    assertNotEqual(after.ARN, before.ARN);

    // And the one it replaced is waiting out its recovery window.
    const replaced = await simAws
      .secretsManager()
      .describeSecret(new DescribeSecretCommand({ SecretId: name }));

    assertNonNullable(replaced.DeletedDate);
  });

  it("leaves the secret alone when the update it asks for fails", async () => {
    // Given a deployed secret holding a generated password.
    const simAws = secretUpdateSimAws();
    const name = secretName();
    const stack = stackName();
    await deploySecretStack(simAws, stack, secretTemplate({ name }));

    const before = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: name }));

    // When the update names a KMS key that does not exist, and a different
    // value for the secret to be written under it.
    const updating = updateSecretStack(
      simAws,
      stack,
      secretTemplate({ name, kmsKeyId: "alias/absent", secretString: "two" }),
    );

    // Then the update is refused, saying which Resource it stopped on.
    const error = await assertThrowsErrorAsync(async () => {
      await updating;
    });

    assertStringIncludes(
      error.message,
      "Sim CloudFormation Resource EdgeCredential update failed",
    );

    // And the secret still holds what it did.
    const after = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: name }));

    assertIdentical(after.SecretString, before.SecretString);
    assertIdentical(after.VersionId, before.VersionId);
  });

  it("replaces the Resource when the template changes its type", async () => {
    // Given a deployed secret.
    const simAws = secretUpdateSimAws();
    const name = secretName();
    const stack = stackName();
    await deploySecretStack(simAws, stack, secretTemplate({ name }));

    // When the template makes that logical ID something else entirely.
    await updateSecretStack(simAws, stack, {
      Resources: {
        EdgeCredential: {
          Type: "AWS::SSM::Parameter",
          Properties: { Name: name, Type: "String", Value: "not a secret" },
        },
      },
    });

    // Then the secret is gone and the parameter is there in its place.
    const described = await simAws
      .secretsManager()
      .describeSecret(new DescribeSecretCommand({ SecretId: name }));

    assertNonNullable(described.DeletedDate);

    const parameter = await simAws
      .ssm()
      .getParameter({ input: { Name: name } });

    assertIdentical(parameter.Parameter?.Value, "not a secret");
  });
});
