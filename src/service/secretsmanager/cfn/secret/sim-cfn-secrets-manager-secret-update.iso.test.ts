import { faker } from "@faker-js/faker";
import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import {
  assertIdentical,
  assertNonNullable,
  assertNotEqual,
  assertStringLength,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deploySecretStack,
  deployedSecretArn,
  secretUpdateSimAws,
  updateSecretStack,
} from "./sim-cfn-secrets-manager-secret-update.test-support.js";
import { secretTemplate } from "./sim-cfn-secrets-manager-secret-template.test-support.js";

describe("Secrets Manager CloudFormation Secret update", () => {
  const secretName = (): string => `edge-credential-${faker.string.uuid()}`;
  const stackName = (): string => `edge-${faker.string.uuid()}`;

  it("keeps a generated value when only the Description changes", async () => {
    // Given a deployed secret holding a generated password.
    const simAws = secretUpdateSimAws();
    const name = secretName();
    const stack = stackName();
    await deploySecretStack(
      simAws,
      stack,
      secretTemplate({ name, description: "the edge credential" }),
    );

    const before = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: name }));

    // When the Stack is updated with a new Description, which real
    // CloudFormation applies with no interruption.
    await updateSecretStack(
      simAws,
      stack,
      secretTemplate({ name, description: "the credential the edge sends" }),
    );

    // Then the secret keeps its ARN, its current version and its password.
    const after = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: name }));

    assertIdentical(after.ARN, before.ARN);
    assertIdentical(after.VersionId, before.VersionId);
    assertIdentical(after.SecretString, before.SecretString);
  });

  it("keeps anything holding a copy of the value in step", async () => {
    // Given a deployed secret and a Resource that read it as it deployed.
    const simAws = secretUpdateSimAws();
    const name = secretName();
    const stack = stackName();
    await deploySecretStack(
      simAws,
      stack,
      secretTemplate({ name, description: "first", reader: true }),
    );

    const copied = await simAws.ssm().getParameter({
      input: { Name: "edge-credential-copy" },
    });

    // When the Stack is updated with a change to the secret alone.
    await updateSecretStack(
      simAws,
      stack,
      secretTemplate({ name, description: "second", reader: true }),
    );

    // Then the copy still matches what the secret holds.
    const secret = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: name }));

    assertNonNullable(secret.SecretString);
    assertIdentical(
      copied.Parameter?.Value,
      (JSON.parse(secret.SecretString) as { current: string }).current,
    );
  });

  it("writes a new version when the value the template asks for changes", async () => {
    // Given a deployed secret holding a supplied value.
    const simAws = secretUpdateSimAws();
    const name = secretName();
    const stack = stackName();
    await deploySecretStack(
      simAws,
      stack,
      secretTemplate({ name, secretString: "one" }),
    );

    const before = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: name }));

    // When the template supplies a different value.
    await updateSecretStack(
      simAws,
      stack,
      secretTemplate({ name, secretString: "two" }),
    );

    // Then the secret holds it, under a new version of the same secret.
    const after = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: name }));

    assertIdentical(after.SecretString, "two");
    assertIdentical(after.ARN, before.ARN);
    assertNotEqual(after.VersionId, before.VersionId);
  });

  it("generates again when GenerateSecretString changes", async () => {
    // Given a deployed secret holding a 64-character generated password.
    const simAws = secretUpdateSimAws();
    const name = secretName();
    const stack = stackName();
    await deploySecretStack(
      simAws,
      stack,
      secretTemplate({ name, passwordLength: 64 }),
    );

    const before = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: name }));

    // When the template asks for a different password.
    await updateSecretStack(
      simAws,
      stack,
      secretTemplate({ name, passwordLength: 32 }),
    );

    // Then a new one is generated, as real CloudFormation writes a new version
    // for a changed GenerateSecretString.
    const after = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: name }));

    assertNonNullable(after.SecretString);
    assertNotEqual(after.SecretString, before.SecretString);
    assertIdentical(after.ARN, before.ARN);

    const generated = JSON.parse(after.SecretString) as { current: string };

    assertStringLength(generated.current, 32);
  });

  it("updates a secret CloudFormation named for it", async () => {
    // Given a deployed secret the template left unnamed.
    const simAws = secretUpdateSimAws();
    const stack = stackName();
    await deploySecretStack(
      simAws,
      stack,
      secretTemplate({ description: "first" }),
    );

    const arn = deployedSecretArn(simAws, stack);
    const before = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: arn }));

    // When the Description changes.
    await updateSecretStack(
      simAws,
      stack,
      secretTemplate({ description: "second" }),
    );

    // Then the secret it generated a name for is the one still deployed.
    const after = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: arn }));

    assertIdentical(after.SecretString, before.SecretString);
    assertIdentical(after.ARN, before.ARN);
  });
});
