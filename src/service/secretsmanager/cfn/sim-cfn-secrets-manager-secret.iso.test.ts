import {
  DescribeSecretCommand,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringLength,
  assertStringMatches,
  assertStringStartsWith,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimSecretsManagerSecret } from "../secret/sim-secrets-manager-secret.js";

const accountIdOneOnes = "111111111111";

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

describe("Secrets Manager CloudFormation Secret deployment", () => {
  it("creates a secret holding the SecretString the template supplies", async () => {
    // Given a template declaring a secret with a supplied value.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "db-stack",
      template: {
        Resources: {
          DbSecret: {
            Type: "AWS::SecretsManager::Secret",
            Properties: {
              Name: "db-credentials",
              Description: "Credentials for the application database",
              KmsKeyId: "alias/aws/secretsmanager",
              SecretString: JSON.stringify({
                username: "app",
                password: "hunter2",
              }),
              Tags: [{ Key: "component", Value: "database" }],
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the deployed secret holds that value under its AWSCURRENT version.
    const read = await simAws
      .secretsManager()
      .getSecretValue(
        new GetSecretValueCommand({ SecretId: "db-credentials" }),
      );

    assertIdentical(
      read.SecretString,
      JSON.stringify({ username: "app", password: "hunter2" }),
    );
    assertIdentical(read.VersionStages?.at(0), "AWSCURRENT");

    // And the metadata the template declared is reported back.
    const described = await simAws
      .secretsManager()
      .describeSecret(
        new DescribeSecretCommand({ SecretId: "db-credentials" }),
      );

    assertIdentical(
      described.Description,
      "Credentials for the application database",
    );
    assertIdentical(described.KmsKeyId, "alias/aws/secretsmanager");
    assertArrayLength(described.Tags ?? [], 1);
    assertIdentical(described.Tags?.at(0)?.Key, "component");
  });

  it("resolves Ref and Fn::GetAtt Id to the full secret ARN", async () => {
    // Given a template referencing its secret both ways.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "db-stack",
      template: {
        Resources: {
          DbSecret: {
            Type: "AWS::SecretsManager::Secret",
            Properties: {
              Name: "db-credentials",
              SecretString: "hunter2",
            },
          },
        },
        Outputs: {
          SecretRef: { Value: { Ref: "DbSecret" } },
          SecretId: { Value: { "Fn::GetAtt": ["DbSecret", "Id"] } },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then both resolve to the ARN carrying the six random characters real
    // Secrets Manager appends, so either can be used as a SecretId.
    const secretRef = stack.outputs.get("SecretRef")?.value;
    const secretId = stack.outputs.get("SecretId")?.value;

    assertTypeString(secretRef);
    assertTypeString(secretId);
    assertIdentical(secretRef, secretId);
    assertStringStartsWith(
      secretRef,
      "arn:aws:secretsmanager:eu-west-2:111111111111:secret:db-credentials-",
    );

    const suffix = secretRef.split("db-credentials-", 2).at(1);
    assertNonNullable(suffix);
    assertStringLength(suffix, 6);

    // And the ARN the template resolved names the deployed secret.
    const read = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: secretRef }));
    assertIdentical(read.SecretString, "hunter2");
  });

  it("generates a value from GenerateSecretString", async () => {
    // Given a template asking Secrets Manager to generate the password.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "db-stack",
      template: {
        Resources: {
          DbSecret: {
            Type: "AWS::SecretsManager::Secret",
            Properties: {
              Name: "db-credentials",
              GenerateSecretString: {
                SecretStringTemplate: JSON.stringify({ username: "app" }),
                GenerateStringKey: "password",
                PasswordLength: 24,
                ExcludePunctuation: true,
              },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the deployed secret holds the template's username alongside a
    // generated password honouring the options, which a test reads out of the
    // simulation exactly as a deployed application would.
    const read = await simAws
      .secretsManager()
      .getSecretValue(
        new GetSecretValueCommand({ SecretId: "db-credentials" }),
      );

    assertTypeString(read.SecretString);
    const value = JSON.parse(read.SecretString) as {
      username?: string;
      password?: string;
    };

    assertIdentical(value.username, "app");
    assertTypeString(value.password);
    assertStringLength(value.password, 24);
    assertStringMatches(value.password, /^[\dA-Za-z]+$/);
  });

  it("generates a whole-value password for an empty GenerateSecretString", async () => {
    // Given the property CDK synthesises for a secret with no options, which
    // is an empty object rather than an absent property.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "db-stack",
      template: {
        Resources: {
          ApiSecret: {
            Type: "AWS::SecretsManager::Secret",
            Properties: {
              GenerateSecretString: {},
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the secret is named after its logical ID, as sim CloudFormation
    // names other unnamed resources.
    const read = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: "ApiSecret" }));

    // And it holds the 32-character password real Secrets Manager defaults to.
    assertTypeString(read.SecretString);
    assertStringLength(read.SecretString, 32);
  });

  it("backs the CloudFormation Resource with the simulated secret", async () => {
    // Given a deployed secret.
    const simAws = simAwsInEuWest2();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "db-stack",
      template: {
        Resources: {
          DbSecret: {
            Type: "AWS::SecretsManager::Secret",
            Properties: {
              Name: "db-credentials",
              SecretString: "hunter2",
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // When the Resource is inspected.
    const resource = stack.getResource("DbSecret");
    assertNonNullable(resource);

    // Then it is backed by the same simulated secret the service holds.
    const secret = resource.simResource as SimSecretsManagerSecret | undefined;
    assertNonNullable(secret);
    assertIdentical(secret.name, "db-credentials");
    assertIdentical(
      simAws.secretsManager().findSecret("db-credentials")?.arn.value,
      secret.arn.value,
    );
  });

  it("creates the secret in the stack's account and region", async () => {
    // Given a simulated AWS whose default scope is not the stack's.
    const simAws = new SimAws();

    // When a template is deployed into another account and region.
    const stack = await simAws
      .account(accountIdOneOnes)
      .region("us-east-1")
      .cloudFormation()
      .deployTemplate({
        stackName: "db-stack",
        template: {
          Resources: {
            DbSecret: {
              Type: "AWS::SecretsManager::Secret",
              Properties: {
                Name: "db-credentials",
                SecretString: "hunter2",
              },
            },
          },
        },
      });
    await stack.waitForDeployComplete();

    // Then the secret exists in that account and region, and nowhere else.
    const scoped = simAws
      .account(accountIdOneOnes)
      .region("us-east-1")
      .secretsManager();

    const scopedSecret = scoped.findSecret("db-credentials");
    assertNonNullable(scopedSecret);
    assertStringStartsWith(
      scopedSecret.arn.value,
      "arn:aws:secretsmanager:us-east-1:111111111111:secret:",
    );
    assertUndefined(simAws.secretsManager().findSecret("db-credentials"));
  });
});
