import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../../cloudformation/stack/sim-cfn-deployed-stack.type.js";

const accountIdOneOnes = "111111111111";

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

async function deployReading(
  simAws: SimAws,
  value: string,
): Promise<SimCfnDeployedStack> {
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

  return stack;
}

function readValue(simAws: SimAws): string {
  const parameter = simAws.ssm().findParameter("/myapp/read");
  assertNonNullable(parameter, "the deployed parameter");

  return parameter.currentVersion.value.value;
}

/**
 * The one record the Stack made about a dynamic reference.
 *
 * A Resource can record properties of its own alongside this, so the reference
 * is picked out by what its reason quotes.
 */
function dynamicReferenceRecord(stack: SimCfnDeployedStack): {
  path: string;
  reason: string;
} {
  const [ignored, ...rest] = stack.ignoredProperties.filter((property) =>
    property.reason.includes("{{resolve:"),
  );
  assertNonNullable(ignored, "a recorded dynamic reference");
  assertArrayLength(rest, 0, "no second recorded dynamic reference");

  return { path: ignored.path, reason: ignored.reason };
}

/**
 * Seed a secret holding a database username and password.
 */
async function createCredentials(simAws: SimAws): Promise<void> {
  await simAws.secretsManager().createSecret({
    input: {
      Name: "db-credentials",
      SecretString: JSON.stringify({ username: "app", password: "hunter2" }),
    },
  });
}

describe("Secrets Manager CloudFormation dynamic references the simulation cannot answer", () => {
  it("deploys with a stand-in value where the secret is absent", async () => {
    // Given nothing in Secrets Manager.
    const simAws = simAwsInEuWest2();

    // When a template reads a secret that was never created.
    const stack = await deployReading(
      simAws,
      "{{resolve:secretsmanager:db-credentials:SecretString:password}}",
    );

    // Then the Stack deploys and the Resource holds a stand-in value.
    assertIdentical(stack.status, "CREATE_COMPLETE");
    assertIdentical(readValue(simAws), "dummy-value-for-db-credentials");

    // And the substitution is recorded against the property that held it.
    const ignored = dynamicReferenceRecord(stack);
    assertIdentical(ignored.path, "Value");
    assertStringIncludes(ignored.reason, "db-credentials");
    assertStringIncludes(ignored.reason, "stand-in value");
  });

  it("deploys with a stand-in value where the secret lacks the json key", async () => {
    // Given a JSON secret with no port in it.
    const simAws = simAwsInEuWest2();
    await createCredentials(simAws);

    // When a template names a key the secret does not hold.
    const stack = await deployReading(
      simAws,
      "{{resolve:secretsmanager:db-credentials:SecretString:port}}",
    );

    // Then the Resource holds a stand-in value naming the missing key.
    assertIdentical(readValue(simAws), "dummy-value-for-db-credentials");
    assertStringIncludes(dynamicReferenceRecord(stack).reason, "no 'port' key");
  });

  it("deploys with a stand-in value where a json key names a plain secret", async () => {
    // Given a secret holding a plain string rather than JSON.
    const simAws = simAwsInEuWest2();
    await simAws
      .secretsManager()
      .createSecret({ input: { Name: "api-key", SecretString: "hunter2" } });

    // When a template names a key of it.
    const stack = await deployReading(
      simAws,
      "{{resolve:secretsmanager:api-key:SecretString:password}}",
    );

    // Then the reference says the secret is not a JSON object.
    assertIdentical(readValue(simAws), "dummy-value-for-api-key");
    assertStringIncludes(
      dynamicReferenceRecord(stack).reason,
      "does not hold a JSON object",
    );
  });

  it("deploys with a stand-in value where a json key names a JSON list", async () => {
    // Given a secret holding JSON that is not an object.
    const simAws = simAwsInEuWest2();
    await simAws.secretsManager().createSecret({
      input: { Name: "api-keys", SecretString: JSON.stringify(["hunter2"]) },
    });

    // When a template names a key of it.
    const stack = await deployReading(
      simAws,
      "{{resolve:secretsmanager:api-keys:SecretString:password}}",
    );

    // Then the reference says the secret is not a JSON object.
    assertIdentical(readValue(simAws), "dummy-value-for-api-keys");
    assertStringIncludes(
      dynamicReferenceRecord(stack).reason,
      "does not hold a JSON object",
    );
  });

  it("deploys with a stand-in value where both version selectors are given", async () => {
    // Given a secret a template could have read.
    const simAws = simAwsInEuWest2();
    await createCredentials(simAws);

    // When the reference names a staging label and a version id.
    const stack = await deployReading(
      simAws,
      "{{resolve:secretsmanager:db-credentials:SecretString::AWSCURRENT:4a1b}}",
    );

    // Then it deploys, saying a reference takes one or the other.
    assertIdentical(stack.status, "CREATE_COMPLETE");
    assertStringIncludes(
      dynamicReferenceRecord(stack).reason,
      "one or the other",
    );
  });

  it("deploys with a stand-in value where the secret-string segment is something else", async () => {
    // Given a secret a template could have read.
    const simAws = simAwsInEuWest2();
    await createCredentials(simAws);

    // When the reference names SecretBinary in its second segment.
    const stack = await deployReading(
      simAws,
      "{{resolve:secretsmanager:db-credentials:SecretBinary:password}}",
    );

    // Then it deploys, saying only SecretString is read.
    assertStringIncludes(
      dynamicReferenceRecord(stack).reason,
      "reads SecretString only",
    );
  });

  it("deploys with a stand-in value where the staging label is absent", async () => {
    // Given a secret written once, so nothing is AWSPREVIOUS yet.
    const simAws = simAwsInEuWest2();
    await createCredentials(simAws);

    // When a template names the previous version.
    const stack = await deployReading(
      simAws,
      "{{resolve:secretsmanager:db-credentials:SecretString::AWSPREVIOUS}}",
    );

    // Then the reference says Secrets Manager could not read it.
    assertIdentical(readValue(simAws), "dummy-value-for-db-credentials");
    assertStringIncludes(
      dynamicReferenceRecord(stack).reason,
      "could not read it",
    );
  });

  it("deploys with a stand-in value where an ARN names an Account with no such secret", async () => {
    // Given a secret at home and an ARN naming another Account.
    const simAws = simAwsInEuWest2();
    await createCredentials(simAws);
    const foreignArn =
      "arn:aws:secretsmanager:eu-west-2:222222222222:secret:db-credentials-AbCdEf";

    // When a template reads that ARN.
    const stack = await deployReading(
      simAws,
      `{{resolve:secretsmanager:${foreignArn}:SecretString:password}}`,
    );

    // Then the secret of the same name at home is not read in its place.
    assertIdentical(readValue(simAws), `dummy-value-for-${foreignArn}`);
    assertStringIncludes(
      dynamicReferenceRecord(stack).reason,
      "could not read it",
    );
  });

  it("deploys with a stand-in value where the body names no secret", async () => {
    // Given a reference whose body is empty.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await deployReading(simAws, "{{resolve:secretsmanager:}}");

    // Then it deploys, saying the reference names no secret.
    assertIdentical(stack.status, "CREATE_COMPLETE");
    assertStringIncludes(
      dynamicReferenceRecord(stack).reason,
      "which names no secret",
    );
  });

  it("deploys with a stand-in value where the body has more segments than a reference takes", async () => {
    // Given a secret a template could have read.
    const simAws = simAwsInEuWest2();
    await createCredentials(simAws);

    // When the reference carries a sixth segment.
    const stack = await deployReading(
      simAws,
      "{{resolve:secretsmanager:db-credentials:SecretString:password:::}}",
    );

    // Then it deploys, saying the body has more than a reference takes.
    assertStringIncludes(
      dynamicReferenceRecord(stack).reason,
      "more than the secret id",
    );
  });

  it("deploys with a stand-in value for a secret holding binary", async () => {
    // Given a secret holding bytes.
    const simAws = simAwsInEuWest2();
    await simAws.secretsManager().createSecret({
      input: {
        Name: "api-token",
        SecretBinary: Uint8Array.from([1, 2, 3]),
      },
    });

    // When a template reads it.
    const stack = await deployReading(
      simAws,
      "{{resolve:secretsmanager:api-token}}",
    );

    // Then the reference says a binary value cannot be read this way.
    assertIdentical(readValue(simAws), "dummy-value-for-api-token");
    assertStringIncludes(
      dynamicReferenceRecord(stack).reason,
      "holds a binary value",
    );
  });

  it("deploys with a stand-in value where the ARN is malformed", async () => {
    // Given a secret at home and something ARN-shaped naming no account.
    const simAws = simAwsInEuWest2();
    await createCredentials(simAws);

    // When a template reads a body that starts like an ARN.
    const stack = await deployReading(
      simAws,
      "{{resolve:secretsmanager:arn:aws:secretsmanager:eu-west-2}}",
    );

    // Then the local Secrets Manager is asked, and it refuses the ARN.
    assertStringIncludes(
      dynamicReferenceRecord(stack).reason,
      "could not read it",
    );
  });

  it("deploys with a stand-in value where the ARN names no valid account", async () => {
    // Given an ARN of the right shape carrying something that is no account.
    const simAws = simAwsInEuWest2();
    await createCredentials(simAws);

    // When a template reads it.
    const stack = await deployReading(
      simAws,
      "{{resolve:secretsmanager:arn:aws:secretsmanager:eu-west-2:nobody:secret:db-credentials-AbCdEf}}",
    );

    // Then no account is read from it, and the ARN is refused at home.
    assertStringIncludes(
      dynamicReferenceRecord(stack).reason,
      "could not read it",
    );
  });

  it("records the whole path to a reference nested in a property", async () => {
    // Given a Stack tagging a queue with a secret that does not exist.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "queue-stack",
      template: {
        Resources: {
          Queue: {
            Type: "AWS::SQS::Queue",
            Properties: {
              QueueName: "work",
              Tags: [
                {
                  Key: "owner",
                  Value: "{{resolve:secretsmanager:owner-tag}}",
                },
              ],
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the record names the list position the reference sat on.
    assertIdentical(dynamicReferenceRecord(stack).path, "Tags.0.Value");
  });
});
