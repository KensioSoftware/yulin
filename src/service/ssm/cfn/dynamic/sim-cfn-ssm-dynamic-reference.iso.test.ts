import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

const accountIdOneOnes = "111111111111";

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

/**
 * Deploy one parameter holding the value under test, after seeding whatever
 * the test needs Parameter Store to already hold.
 */
async function deployReading(
  simAws: SimAws,
  value: SimCfnTemplateValue,
  parameters: Record<string, { Type: string; Default?: string }> = {},
): Promise<SimCfnDeployedStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "config-stack",
    template: {
      Parameters: parameters,
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

describe("SSM CloudFormation dynamic references", () => {
  it("resolves a reference to the current parameter value", async () => {
    // Given a parameter holding a value.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: { Name: "/myapp/db-host", Type: "String", Value: "db.internal" },
    });

    // When a template reads it through a dynamic reference.
    await deployReading(simAws, "{{resolve:ssm:/myapp/db-host}}");

    // Then the Resource is created with the parameter's value.
    assertIdentical(readValue(simAws), "db.internal");
  });

  it("resolves a reference to the version it names", async () => {
    // Given a parameter written twice.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: {
        Name: "/myapp/db-host",
        Type: "String",
        Value: "first.internal",
      },
    });
    await simAws.ssm().putParameter({
      input: {
        Name: "/myapp/db-host",
        Value: "second.internal",
        Overwrite: true,
      },
    });

    // When a template names the first version.
    await deployReading(simAws, "{{resolve:ssm:/myapp/db-host:1}}");

    // Then that version's value is read rather than the current one.
    assertIdentical(readValue(simAws), "first.internal");
  });

  it("substitutes a reference sitting inside a longer string", async () => {
    // Given a parameter holding a host name.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: { Name: "/myapp/db-host", Type: "String", Value: "db.internal" },
    });

    // When a template wraps the reference in surrounding text.
    await deployReading(
      simAws,
      "postgres://{{resolve:ssm:/myapp/db-host}}:5432/app",
    );

    // Then only the reference is replaced.
    assertIdentical(readValue(simAws), "postgres://db.internal:5432/app");
  });

  it("resolves a reference whose name comes from an Fn::Sub variable", async () => {
    // Given a parameter under an environment-specific path.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: {
        Name: "/myapp/prod/db-host",
        Type: "String",
        Value: "prod-db.internal",
      },
    });

    // When the reference names it through an Fn::Sub variable.
    await deployReading(
      simAws,
      // oxlint-disable-next-line no-template-curly-in-string -- Fn::Sub syntax, not a JavaScript template.
      { "Fn::Sub": "{{resolve:ssm:/myapp/${Environment}/db-host}}" },
      { Environment: { Type: "String", Default: "prod" } },
    );

    // Then the substituted name is what Parameter Store is asked for.
    assertIdentical(readValue(simAws), "prod-db.internal");
  });

  it("hands a StringList parameter to Fn::Split as one comma-separated string", async () => {
    // Given a StringList parameter.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: {
        Name: "/myapp/hosts",
        Type: "StringList",
        Value: "a.internal,b.internal",
      },
    });

    // When a template splits the reference and selects from it.
    await deployReading(simAws, {
      "Fn::Select": [1, { "Fn::Split": [",", "{{resolve:ssm:/myapp/hosts}}"] }],
    });

    // Then the reference resolved before the split ran.
    assertIdentical(readValue(simAws), "b.internal");
  });
});
