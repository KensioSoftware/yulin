import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertStringLength,
  assertThrowsError,
  assertTrue,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimSecretsManagerCfnResourceFactory } from "./sim-cfn-secrets-manager-resource-factory.js";

const accountIdOneOnes = "111111111111" as SimAwsAccountId;

function secretResource(
  properties: SimCfnTemplateValueRecord,
  logicalId = "BadSecret",
): SimCfnResource {
  return new SimCfnResource({
    accountRegionScope: {
      accountId: accountIdOneOnes,
      regionName: "eu-west-2",
    },
    logicalId,
    template: {
      Type: "AWS::SecretsManager::Secret",
      Properties: properties,
    },
  });
}

/**
 * Create a secret straight through the Resource factory, returning whatever it
 * rejects with. Keeps the property rules under test without a whole stack.
 */
async function createSecretResource(
  properties: SimCfnTemplateValueRecord,
  resourceTypeName = "Secret",
): Promise<Error> {
  const simAws = new SimAws();
  const factory = new SimSecretsManagerCfnResourceFactory({
    secretsManager: simAws.secretsManager(),
  });

  try {
    await factory.create(resourceTypeName, secretResource(properties), {
      simAws,
      resources: new Map(),
    });
  } catch (error) {
    assertInstanceOf(error, Error);

    return error;
  }

  throw new Error("Expected Secret creation to reject");
}

describe("Secrets Manager CloudFormation Secret validation", () => {
  it("refuses SecretString and GenerateSecretString together", async () => {
    // Given a template both supplying a value and asking for a generated one,
    // which real CloudFormation rejects.
    // When the Resource is created, then it is refused.
    const error = await createSecretResource({
      Name: "db-credentials",
      SecretString: "hunter2",
      GenerateSecretString: {},
    });

    assertIdentical(
      error.message,
      "Invalid AWS::SecretsManager::Secret Resource BadSecret: " +
        "SecretString and GenerateSecretString cannot both be declared: " +
        "a secret either holds the value the template supplies or one " +
        "Secrets Manager generates",
    );
  });

  it("refuses a secret with no value at all", async () => {
    // Given a template declaring neither a value nor a generated one. Real
    // CloudFormation creates an empty secret, which is not simulated, so the
    // Resource is refused rather than deployed with nothing to read.
    // When the Resource is created, then it is refused.
    const error = await createSecretResource({ Name: "db-credentials" });

    assertStringIncludes(
      error.message,
      "either SecretString or GenerateSecretString is required",
    );
  });

  it("refuses malformed property values", async () => {
    // Given properties of the wrong shape.
    // When each Resource is created, then each is refused by name.
    const name = await createSecretResource({ Name: 42, SecretString: "x" });
    assertInstanceOf(name, TypeError);
    assertIdentical(
      name.message,
      "Invalid AWS::SecretsManager::Secret BadSecret: Name must be a string",
    );

    const generate = await createSecretResource({
      GenerateSecretString: "please",
    });
    assertIdentical(
      generate.message,
      "Invalid AWS::SecretsManager::Secret BadSecret: " +
        "GenerateSecretString must be an object",
    );

    const length = await createSecretResource({
      GenerateSecretString: { PasswordLength: "very long" },
    });
    assertIdentical(
      length.message,
      "Invalid AWS::SecretsManager::Secret BadSecret: " +
        "GenerateSecretString.PasswordLength must be a number",
    );

    const emptyLength = await createSecretResource({
      GenerateSecretString: { PasswordLength: " " },
    });
    assertStringIncludes(
      emptyLength.message,
      "PasswordLength must be a number",
    );

    const require = await createSecretResource({
      GenerateSecretString: { RequireEachIncludedType: "maybe" },
    });
    assertIdentical(
      require.message,
      "Invalid AWS::SecretsManager::Secret BadSecret: " +
        "GenerateSecretString.RequireEachIncludedType must be a boolean",
    );
  });

  it("refuses malformed Tags", async () => {
    // Given Tags that are not a list of Key/Value objects.
    // When each Resource is created, then each is refused.
    const notAList = await createSecretResource({
      SecretString: "hunter2",
      Tags: { component: "database" },
    });
    assertIdentical(
      notAList.message,
      "Invalid AWS::SecretsManager::Secret BadSecret: Tags must be a list",
    );

    const notObjects = await createSecretResource({
      SecretString: "hunter2",
      Tags: ["component"],
    });
    assertIdentical(
      notObjects.message,
      "Invalid AWS::SecretsManager::Secret BadSecret: Tags.0 must be an object",
    );

    const badValue = await createSecretResource({
      SecretString: "hunter2",
      Tags: [{ Key: "component", Value: 7 }],
    });
    assertIdentical(
      badValue.message,
      "Invalid AWS::SecretsManager::Secret BadSecret: " +
        "Tags.0.Value must be a string",
    );
  });

  it("reports Resource types it does not simulate as unsupported", async () => {
    // Given a Secrets Manager Resource type that is not simulated.
    // When the Resource is created, then it is reported as unsupported, which
    // is what makes sim CloudFormation skip it rather than fail the stack.
    const error = await createSecretResource({}, "RotationSchedule");

    assertIdentical(
      error.message,
      "Unsupported sim Secrets Manager CloudFormation Resource RotationSchedule",
    );
  });

  it("skips an unsimulated Secrets Manager Resource in a deployed stack", async () => {
    // Given a stack whose template carries a rotation schedule alongside a
    // secret.
    const simAws = new SimAws();

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
          DbSecretRotation: {
            Type: "AWS::SecretsManager::RotationSchedule",
            Properties: {
              SecretId: { Ref: "DbSecret" },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the secret deploys and the rotation schedule is skipped with a
    // reason, rather than quietly counting as deployed.
    const rotation = stack.getResource("DbSecretRotation");
    assertNonNullable(rotation);
    assertTrue(rotation.skipped);
    assertStringIncludes(
      rotation.skippedReason ?? "",
      "Unsupported sim Secrets Manager CloudFormation Resource RotationSchedule",
    );

    const read = await simAws
      .secretsManager()
      .getSecretValue(
        new GetSecretValueCommand({ SecretId: "db-credentials" }),
      );
    assertIdentical(read.SecretString, "hunter2");
  });

  it("refuses an attribute a secret does not have", async () => {
    // Given a deployed secret.
    const simAws = new SimAws();
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

    const resource = stack.getResource("DbSecret");
    assertNonNullable(resource);

    // When an attribute the simulator does not model is read, then it is
    // refused rather than answered with something made up.
    const error = assertThrowsError(() => resource.attributeValue("Arn"));

    assertIdentical(
      error.message,
      "Unsupported AWS::SecretsManager::Secret attribute Arn",
    );
  });

  it("accepts template values CloudFormation carries as strings", async () => {
    // Given a template whose numeric and boolean options arrive as strings,
    // as they do when they come from a Parameter.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "db-stack",
      template: {
        Parameters: {
          PasswordLength: { Type: "String", Default: "18" },
        },
        Resources: {
          DbSecret: {
            Type: "AWS::SecretsManager::Secret",
            Properties: {
              Name: "db-credentials",
              GenerateSecretString: {
                PasswordLength: { Ref: "PasswordLength" },
                ExcludePunctuation: "true",
              },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then they are read as the number and boolean they stand for.
    const read = await simAws
      .secretsManager()
      .getSecretValue(
        new GetSecretValueCommand({ SecretId: "db-credentials" }),
      );

    assertTypeString(read.SecretString);
    assertStringLength(read.SecretString, 18);
    assertTrue(/^[\dA-Za-z]+$/.test(read.SecretString));
  });
});
