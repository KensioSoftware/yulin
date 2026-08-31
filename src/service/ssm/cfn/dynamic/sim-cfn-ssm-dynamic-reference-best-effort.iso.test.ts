import {
  assertArrayEmpty,
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
 * A Resource can record properties of its own alongside this, such as a queue
 * tag nothing simulated reads, so the reference is picked out by name.
 */
function dynamicReferenceRecord(stack: SimCfnDeployedStack): {
  path: string;
  reason: string;
} {
  const [ignored, ...rest] = stack.ignoredProperties.filter((property) =>
    property.reason.includes("{{resolve:"),
  );
  assertNonNullable(ignored, "a recorded dynamic reference");
  assertArrayEmpty(rest, "no second recorded dynamic reference");

  return { path: ignored.path, reason: ignored.reason };
}

describe("SSM CloudFormation dynamic references the simulation cannot answer", () => {
  it("deploys with a stand-in value where the parameter is absent", async () => {
    // Given nothing in Parameter Store.
    const simAws = simAwsInEuWest2();

    // When a template reads a parameter that was never created.
    const stack = await deployReading(simAws, "{{resolve:ssm:/myapp/db-host}}");

    // Then the Stack deploys and the Resource holds a stand-in value.
    assertIdentical(stack.status, "CREATE_COMPLETE");
    assertIdentical(readValue(simAws), "dummy-value-for-/myapp/db-host");

    // And the substitution is recorded against the property that held it.
    const ignored = dynamicReferenceRecord(stack);
    assertIdentical(ignored.path, "Value");
    assertStringIncludes(ignored.reason, "/myapp/db-host");
    assertStringIncludes(ignored.reason, "stand-in value");
  });

  it("deploys with a stand-in value where the version is absent", async () => {
    // Given a parameter with one version.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: { Name: "/myapp/db-host", Type: "String", Value: "db.internal" },
    });

    // When a template names a version it has never had.
    const stack = await deployReading(
      simAws,
      "{{resolve:ssm:/myapp/db-host:4}}",
    );

    // Then the Resource holds a stand-in value naming the missing version.
    assertIdentical(readValue(simAws), "dummy-value-for-/myapp/db-host");
    assertStringIncludes(dynamicReferenceRecord(stack).reason, "no version 4");
  });

  it("deploys with a stand-in value for a SecureString parameter", async () => {
    // Given an encrypted parameter.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: { Name: "/myapp/token", Type: "SecureString", Value: "s3cret" },
    });

    // When a plain ssm reference reads it.
    const stack = await deployReading(simAws, "{{resolve:ssm:/myapp/token}}");

    // Then the ciphertext stays put and the reference says why.
    assertIdentical(readValue(simAws), "dummy-value-for-/myapp/token");
    assertStringIncludes(dynamicReferenceRecord(stack).reason, "ssm-secure");
  });

  it("deploys with a stand-in value where the reference body is malformed", async () => {
    // Given a reference whose version is not an integer.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await deployReading(
      simAws,
      "{{resolve:ssm:/myapp/db-host:latest}}",
    );

    // Then it deploys, saying the body was not a name and a version.
    assertIdentical(stack.status, "CREATE_COMPLETE");
    assertStringIncludes(
      dynamicReferenceRecord(stack).reason,
      "integer version",
    );
  });

  it("records the whole path to a reference nested in a property", async () => {
    // Given a Stack tagging a queue with a parameter that does not exist.
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
              Tags: [{ Key: "owner", Value: "{{resolve:ssm:/myapp/owner}}" }],
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the record names the list position the reference sat on.
    assertIdentical(dynamicReferenceRecord(stack).path, "Tags.0.Value");
  });

  it("leaves a reference to a service with no resolver as it was written", async () => {
    // Given a reference naming a service this simulation has no resolver for.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await deployReading(simAws, "{{resolve:vault:/myapp/token}}");

    // Then the reference is untouched and nothing is recorded about it.
    assertIdentical(readValue(simAws), "{{resolve:vault:/myapp/token}}");
    assertArrayEmpty(stack.ignoredProperties);
  });
});
