import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../../aws/sim-aws.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../value/sim-cfn-template-value.js";

/**
 * Read one property back out of the simulation.
 *
 * The value under test is deployed as a Parameter's value, so whatever the
 * reference resolved to is whatever the Parameter ended up holding.
 */
function readingParameter(
  value: SimCfnTemplateValue,
): SimCfnTemplateValueRecord {
  return {
    Type: "AWS::SSM::Parameter",
    Properties: { Name: "/myapp/read", Type: "String", Value: value },
  };
}

async function deploy(
  simAws: SimAws,
  resources: SimCfnTemplateValueRecord,
  parameters?: Record<string, string>,
): Promise<void> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "app-stack",
    template: {
      Parameters:
        parameters === undefined
          ? undefined
          : Object.fromEntries(
              Object.keys(parameters).map((name) => [name, { Type: "String" }]),
            ),
      Resources: resources,
    },
    parameters,
  });
  await stack.waitForDeployComplete();
}

function readValue(simAws: SimAws): string {
  const parameter = simAws.ssm().findParameter("/myapp/read");
  assertNonNullable(parameter, "the deployed parameter");

  return parameter.currentVersion.value.value;
}

describe("CloudFormation Fn::Join assembling a dynamic reference", () => {
  it("resolves a secretsmanager reference built around a Ref to a secret in the same Stack", async () => {
    // Given a secret whose name the template never wrote, so that reading it
    // has to go through a Ref, as CDK writes it.
    const simAws = new SimAws();

    // When a Resource reads that secret through a reference assembled by
    // Fn::Join.
    await deploy(simAws, {
      OriginSecret: {
        Type: "AWS::SecretsManager::Secret",
        Properties: { SecretString: JSON.stringify({ current: "hunter2" }) },
      },
      Read: readingParameter({
        "Fn::Join": [
          "",
          [
            "{{resolve:secretsmanager:",
            { Ref: "OriginSecret" },
            ":SecretString:current::}}",
          ],
        ],
      }),
    });

    // Then the property holds the secret's value rather than the reference.
    assertIdentical(readValue(simAws), "hunter2");
  });

  it("resolves an ssm reference built around a Ref to a Parameter in the same Stack", async () => {
    // Given a Parameter another Resource reads by Ref.
    const simAws = new SimAws();

    // When the reference reading it is assembled by Fn::Join.
    await deploy(simAws, {
      HostParameter: {
        Type: "AWS::SSM::Parameter",
        Properties: {
          Name: "/myapp/host",
          Type: "String",
          Value: "db.example.com",
        },
      },
      Read: readingParameter({
        "Fn::Join": ["", ["{{resolve:ssm:", { Ref: "HostParameter" }, "}}"]],
      }),
    });

    // Then the property holds the Parameter's value.
    assertIdentical(readValue(simAws), "db.example.com");
  });

  it("keeps the text a joined reference sits inside", async () => {
    // Given a Parameter holding a host name.
    const simAws = new SimAws();

    // When the assembled reference is joined into a longer value.
    await deploy(simAws, {
      HostParameter: {
        Type: "AWS::SSM::Parameter",
        Properties: {
          Name: "/myapp/host",
          Type: "String",
          Value: "db.example.com",
        },
      },
      Read: readingParameter({
        "Fn::Join": [
          "",
          [
            "https://",
            "{{resolve:ssm:",
            { Ref: "HostParameter" },
            "}}",
            "/health",
          ],
        ],
      }),
    });

    // Then only the reference is replaced.
    assertIdentical(readValue(simAws), "https://db.example.com/health");
  });

  it("resolves a reference assembled before any Resource exists", async () => {
    // Given a secret the Stack does not declare, named by a Stack Parameter.
    const simAws = new SimAws();
    await simAws.secretsManager().createSecret({
      input: {
        Name: "db-credentials",
        SecretString: JSON.stringify({ password: "hunter2" }),
      },
    });

    // When the reference is assembled out of literals and that Parameter, so
    // the join finishes on the up-front template pass.
    await deploy(
      simAws,
      {
        Read: readingParameter({
          "Fn::Join": [
            "",
            [
              "{{resolve:secretsmanager:",
              { Ref: "SecretName" },
              ":SecretString:password::}}",
            ],
          ],
        }),
      },
      { SecretName: "db-credentials" },
    );

    // Then the property still holds the secret's value.
    assertIdentical(readValue(simAws), "hunter2");
  });
});
