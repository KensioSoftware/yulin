import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

const accountIdOneOnes = "111111111111";
const accountIdTwoTwos = "222222222222";

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

/**
 * Deploy one parameter holding the value under test, so that whatever the
 * reference resolved to can be read back out of the simulation.
 */
async function deployReading(
  simAws: SimAws,
  value: SimCfnTemplateValue,
): Promise<void> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "config-stack",
    template: {
      Resources: {
        Read: {
          Type: "AWS::SSM::Parameter",
          Properties: { Name: "/myapp/read", Type: "String", Value: value },
        },
      },
    },
  });
  await stack.waitForDeployComplete();
}

function readValue(simAws: SimAws): string {
  const parameter = simAws.ssm().findParameter("/myapp/read");
  assertNonNullable(parameter, "the deployed parameter");

  return parameter.currentVersion.value.value;
}

describe("Secrets Manager CloudFormation dynamic references", () => {
  it("resolves a reference to the whole current secret string", async () => {
    // Given a secret holding a plain string.
    const simAws = simAwsInEuWest2();
    await simAws
      .secretsManager()
      .createSecret({ input: { Name: "api-key", SecretString: "hunter2" } });

    // When a template reads it through a dynamic reference.
    await deployReading(simAws, "{{resolve:secretsmanager:api-key}}");

    // Then the Resource is created with the secret's value.
    assertIdentical(readValue(simAws), "hunter2");
  });

  it("resolves a json-key segment to that key of a JSON secret", async () => {
    // Given a secret holding a JSON object.
    const simAws = simAwsInEuWest2();
    await simAws.secretsManager().createSecret({
      input: {
        Name: "db-credentials",
        SecretString: JSON.stringify({ username: "app", password: "hunter2" }),
      },
    });

    // When a template names one of its keys.
    await deployReading(
      simAws,
      "{{resolve:secretsmanager:db-credentials:SecretString:password}}",
    );

    // Then only that key's value is read.
    assertIdentical(readValue(simAws), "hunter2");
  });

  it("resolves a json-key holding a number to that number as text", async () => {
    // Given a secret whose JSON holds a number.
    const simAws = simAwsInEuWest2();
    await simAws.secretsManager().createSecret({
      input: {
        Name: "db-credentials",
        SecretString: JSON.stringify({ password: "hunter2", port: 5432 }),
      },
    });

    // When a template names the key holding it.
    await deployReading(
      simAws,
      "{{resolve:secretsmanager:db-credentials:SecretString:port}}",
    );

    // Then the value arrives as the text a template property holds.
    assertIdentical(readValue(simAws), "5432");
  });

  it("reads the same value from a body whose trailing segments are empty", async () => {
    // Given a secret holding a plain string.
    const simAws = simAwsInEuWest2();
    await simAws
      .secretsManager()
      .createSecret({ input: { Name: "api-key", SecretString: "hunter2" } });

    // When a template writes every optional segment as empty.
    await deployReading(simAws, "{{resolve:secretsmanager:api-key::::}}");

    // Then it means what naming the secret alone means.
    assertIdentical(readValue(simAws), "hunter2");
  });

  it("resolves a version-stage segment to the version carrying that label", async () => {
    // Given a secret written twice, so an earlier version is AWSPREVIOUS.
    const simAws = simAwsInEuWest2();
    const secretsManager = simAws.secretsManager();
    await secretsManager.createSecret({
      input: { Name: "api-key", SecretString: "old-key" },
    });
    await secretsManager.putSecretValue({
      input: { SecretId: "api-key", SecretString: "new-key" },
    });

    // When a template names the previous staging label.
    await deployReading(
      simAws,
      "{{resolve:secretsmanager:api-key:SecretString::AWSPREVIOUS}}",
    );

    // Then that version's value is read rather than the current one.
    assertIdentical(readValue(simAws), "old-key");
  });

  it("resolves a version-id segment to the version it names", async () => {
    // Given a secret whose first version has a known id.
    const simAws = simAwsInEuWest2();
    const secretsManager = simAws.secretsManager();
    const created = await secretsManager.createSecret({
      input: { Name: "api-key", SecretString: "old-key" },
    });
    await secretsManager.putSecretValue({
      input: { SecretId: "api-key", SecretString: "new-key" },
    });

    // When a template names that version id in the last segment.
    await deployReading(
      simAws,
      `{{resolve:secretsmanager:api-key:SecretString:::${String(created.VersionId)}}}`,
    );

    // Then the version named is read rather than the current one.
    assertIdentical(readValue(simAws), "old-key");
  });

  it("reads the Account a full secret ARN names", async () => {
    // Given a secret in another Account, and one of the same name at home.
    const simAws = simAwsInEuWest2();
    await simAws
      .secretsManager()
      .createSecret({ input: { Name: "api-key", SecretString: "home-key" } });

    const foreign = await simAws
      .account(accountIdTwoTwos)
      .region("eu-west-2")
      .secretsManager()
      .createSecret({
        input: { Name: "api-key", SecretString: "foreign-key" },
      });

    // When a template reads the other Account's secret by its full ARN.
    await deployReading(
      simAws,
      `{{resolve:secretsmanager:${String(foreign.ARN)}}}`,
    );

    // Then the value comes from the Account the ARN names.
    assertIdentical(readValue(simAws), "foreign-key");
  });

  it("substitutes a reference sitting inside a longer string", async () => {
    // Given a secret holding a database password.
    const simAws = simAwsInEuWest2();
    await simAws.secretsManager().createSecret({
      input: { Name: "db-password", SecretString: "hunter2" },
    });

    // When a template wraps the reference in surrounding text.
    await deployReading(
      simAws,
      "postgres://app:{{resolve:secretsmanager:db-password}}@db.internal/app",
    );

    // Then only the reference is replaced.
    assertIdentical(
      readValue(simAws),
      "postgres://app:hunter2@db.internal/app",
    );
  });

  it("resolves two references in one Resource", async () => {
    // Given a secret holding a username and a password.
    const simAws = simAwsInEuWest2();
    await simAws.secretsManager().createSecret({
      input: {
        Name: "db-credentials",
        SecretString: JSON.stringify({ username: "app", password: "hunter2" }),
      },
    });

    // When a template reads both keys into one value.
    await deployReading(simAws, {
      "Fn::Join": [
        ":",
        [
          "{{resolve:secretsmanager:db-credentials:SecretString:username}}",
          "{{resolve:secretsmanager:db-credentials:SecretString:password}}",
        ],
      ],
    });

    // Then each reference is replaced with its own key's value.
    assertIdentical(readValue(simAws), "app:hunter2");
  });

  it("resolves a reference whose secret name comes from an Fn::Sub variable", async () => {
    // Given a secret under an environment-specific name.
    const simAws = simAwsInEuWest2();
    await simAws.secretsManager().createSecret({
      input: { Name: "prod-api-key", SecretString: "hunter2" },
    });

    // When the reference names it through an Fn::Sub variable.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "config-stack",
      template: {
        Parameters: { Environment: { Type: "String", Default: "prod" } },
        Resources: {
          Read: {
            Type: "AWS::SSM::Parameter",
            Properties: {
              Name: "/myapp/read",
              Type: "String",
              Value: {
                // oxlint-disable-next-line no-template-curly-in-string -- Fn::Sub syntax, not a JavaScript template.
                "Fn::Sub": "{{resolve:secretsmanager:${Environment}-api-key}}",
              },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the substituted name is what Secrets Manager is asked for.
    assertIdentical(readValue(simAws), "hunter2");
  });
});
