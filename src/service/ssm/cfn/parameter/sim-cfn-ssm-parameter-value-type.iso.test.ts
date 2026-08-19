import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { jsonStringify } from "../../../../util/type-guard/json.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnStack } from "../../../cloudformation/stack/sim-cfn-stack.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

const accountIdOneOnes = "111111111111";

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

/**
 * Deploy one parameter holding whatever the Parameter under test resolves to.
 *
 * The template Parameters are given as they would be written, so each test
 * says which value type it is declaring and what name it is given.
 */
async function deployReading(properties: {
  readonly simAws: SimAws;
  readonly parameters: Record<string, { Type: string; Default?: string }>;
  readonly value: SimCfnTemplateValue;
  readonly names?: Record<string, string> | undefined;
}): Promise<SimCfnStack> {
  const stack = await properties.simAws.cloudFormation().deployTemplate({
    stackName: "config-stack",
    template: {
      Parameters: properties.parameters,
      Resources: {
        Read: {
          Type: "AWS::SSM::Parameter",
          Properties: {
            Name: "/myapp/read",
            Type: "String",
            Value: properties.value,
          },
        },
      },
    },
    parameters: properties.names,
  });
  await stack.waitForDeployComplete();

  return stack;
}

function readValue(simAws: SimAws): string {
  const parameter = simAws.ssm().findParameter("/myapp/read");
  assertNonNullable(parameter, "the deployed parameter");

  return parameter.currentVersion.value.value;
}

async function putParameter(
  simAws: SimAws,
  name: string,
  value: string,
  type = "String",
): Promise<void> {
  await simAws.ssm().putParameter({
    input: { Name: name, Type: type, Value: value },
  });
}

/**
 * The template the update test deploys and then changes, named after whichever
 * Parameter Store parameter it is reading.
 */
function templateNaming(parameterStoreName: string): {
  Parameters: Record<string, { Type: string; Default: string }>;
  Resources: Record<string, SimCfnTemplateValue>;
} {
  return {
    Parameters: {
      DbHostParameter: {
        Type: "AWS::SSM::Parameter::Value<String>",
        Default: parameterStoreName,
      },
    },
    Resources: {
      Read: {
        Type: "AWS::SSM::Parameter",
        Properties: {
          Name: "/myapp/read",
          Type: "String",
          Value: { Ref: "DbHostParameter" },
        },
      },
    },
  };
}

describe("SSM CloudFormation Parameter::Value template Parameters", () => {
  it("resolves a Ref to the value the named parameter holds", async () => {
    // Given a parameter holding a value.
    const simAws = simAwsInEuWest2();
    await putParameter(simAws, "/myapp/db-host", "db.internal");

    // When a template Parameter typed as a Parameter Store value names it.
    await deployReading({
      simAws,
      parameters: {
        DbHostParameter: {
          Type: "AWS::SSM::Parameter::Value<String>",
          Default: "/myapp/db-host",
        },
      },
      value: { Ref: "DbHostParameter" },
    });

    // Then the Ref resolves to the stored value rather than the name.
    assertIdentical(readValue(simAws), "db.internal");
  });

  it("resolves to the value the parameter holds now", async () => {
    // Given a parameter that has been overwritten.
    const simAws = simAwsInEuWest2();
    await putParameter(simAws, "/myapp/db-host", "first.internal");
    await simAws.ssm().putParameter({
      input: {
        Name: "/myapp/db-host",
        Value: "second.internal",
        Overwrite: true,
      },
    });

    // When a template Parameter names it.
    await deployReading({
      simAws,
      parameters: {
        DbHostParameter: {
          Type: "AWS::SSM::Parameter::Value<String>",
          Default: "/myapp/db-host",
        },
      },
      value: { Ref: "DbHostParameter" },
    });

    // Then the current version is the one read.
    assertIdentical(readValue(simAws), "second.internal");
  });

  it("prefers a name given to CreateStack over the template default", async () => {
    // Given two parameters, one of them named by the template default.
    const simAws = simAwsInEuWest2();
    await putParameter(simAws, "/myapp/db-host", "default.internal");
    await putParameter(simAws, "/myapp/staging/db-host", "staging.internal");

    // When the Stack is created with the other name as the Parameter value.
    await deployReading({
      simAws,
      parameters: {
        DbHostParameter: {
          Type: "AWS::SSM::Parameter::Value<String>",
          Default: "/myapp/db-host",
        },
      },
      value: { Ref: "DbHostParameter" },
      names: { DbHostParameter: "/myapp/staging/db-host" },
    });

    // Then the value read is the one the supplied name holds.
    assertIdentical(readValue(simAws), "staging.internal");
  });

  it("resolves a List value type to the stored list", async () => {
    // Given a StringList parameter holding two hosts.
    const simAws = simAwsInEuWest2();
    await putParameter(
      simAws,
      "/myapp/db-hosts",
      "first.internal,second.internal",
      "StringList",
    );

    // When a list-typed Parameter names it and Fn::Select reads one entry.
    await deployReading({
      simAws,
      parameters: {
        DbHostsParameter: {
          Type: "AWS::SSM::Parameter::Value<List<String>>",
          Default: "/myapp/db-hosts",
        },
      },
      value: { "Fn::Select": [1, { Ref: "DbHostsParameter" }] },
    });

    // Then the stored string was split into a list to select from.
    assertIdentical(readValue(simAws), "second.internal");
  });

  it("resolves a CommaDelimitedList value type to the stored list", async () => {
    // Given a parameter holding a comma-separated string.
    const simAws = simAwsInEuWest2();
    await putParameter(simAws, "/myapp/regions", "eu-west-2,us-east-1");

    // When a CommaDelimitedList-typed Parameter names it.
    await deployReading({
      simAws,
      parameters: {
        RegionsParameter: {
          Type: "AWS::SSM::Parameter::Value<CommaDelimitedList>",
          Default: "/myapp/regions",
        },
      },
      value: { "Fn::Select": [0, { Ref: "RegionsParameter" }] },
    });

    // Then that string was split the same way.
    assertIdentical(readValue(simAws), "eu-west-2");
  });

  it("reads Parameter Store again for a changed template", async () => {
    // Given a deployed Stack whose Parameter named one of two parameters.
    const simAws = simAwsInEuWest2();
    await putParameter(simAws, "/myapp/db-host", "db.internal");
    await putParameter(simAws, "/myapp/replica-host", "replica.internal");
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "config-stack",
      template: templateNaming("/myapp/db-host"),
    });

    // When an update names the other one.
    await simAws.cloudFormation().updateStack({
      input: {
        StackName: "config-stack",
        TemplateBody: jsonStringify(templateNaming("/myapp/replica-host")),
      },
    });
    await stack.waitForUpdateComplete();

    // Then the Resource holds the value the new name is held against.
    assertIdentical(readValue(simAws), "replica.internal");
  });

  it("leaves a Parameter of another type holding the value it was given", async () => {
    // Given a parameter whose name a plain String Parameter carries.
    const simAws = simAwsInEuWest2();
    await putParameter(simAws, "/myapp/db-host", "db.internal");

    // When the template Parameter is not a Parameter Store value type.
    await deployReading({
      simAws,
      parameters: {
        DbHostName: { Type: "String", Default: "/myapp/db-host" },
      },
      value: { Ref: "DbHostName" },
    });

    // Then nothing is read, and the Ref resolves to the name as written.
    assertIdentical(readValue(simAws), "/myapp/db-host");
  });
});
