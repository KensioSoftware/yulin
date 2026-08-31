import {
  assertArrayEmpty,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnIgnoredProperty } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnDeployedStack } from "../../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

const accountIdOneOnes = "111111111111";

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

async function deployReading(properties: {
  readonly simAws: SimAws;
  readonly type: string;
  readonly name: string;
  readonly value: SimCfnTemplateValue;
}): Promise<SimCfnDeployedStack> {
  const stack = await properties.simAws.cloudFormation().deployTemplate({
    stackName: "config-stack",
    template: {
      Parameters: {
        DbHostParameter: { Type: properties.type, Default: properties.name },
      },
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
 * The one record the Stack made about a template Parameter.
 */
function parameterRecord(stack: SimCfnDeployedStack): SimCfnIgnoredProperty {
  const [ignored, ...rest] = stack.ignoredProperties;
  assertNonNullable(ignored, "a recorded template Parameter");
  assertArrayEmpty(rest, "no second record");

  return ignored;
}

describe("SSM CloudFormation Parameter::Value names the store cannot answer", () => {
  it("deploys with a stand-in value where the parameter is absent", async () => {
    // Given nothing in Parameter Store.
    const simAws = simAwsInEuWest2();

    // When a template Parameter names a parameter that was never created.
    const stack = await deployReading({
      simAws,
      type: "AWS::SSM::Parameter::Value<String>",
      name: "/myapp/db-host",
      value: { Ref: "DbHostParameter" },
    });

    // Then the Stack deploys and the Resource holds a stand-in value.
    assertIdentical(stack.status, "CREATE_COMPLETE");
    assertIdentical(readValue(simAws), "dummy-value-for-/myapp/db-host");

    // And the substitution names the Parameter, its type and the name.
    const ignored = parameterRecord(stack);
    assertIdentical(ignored.logicalId, "DbHostParameter");
    assertIdentical(ignored.resourceType, "AWS::SSM::Parameter::Value<String>");
    assertIdentical(ignored.path, "Parameters.DbHostParameter");
    assertStringIncludes(ignored.reason, "/myapp/db-host");
    assertStringIncludes(ignored.reason, "stand-in value");
  });

  it("deploys with a stand-in value for a SecureString parameter", async () => {
    // Given an encrypted parameter, which real CloudFormation refuses to read
    // into a template Parameter.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: { Name: "/myapp/token", Type: "SecureString", Value: "s3cret" },
    });

    // When a template Parameter names it.
    const stack = await deployReading({
      simAws,
      type: "AWS::SSM::Parameter::Value<String>",
      name: "/myapp/token",
      value: { Ref: "DbHostParameter" },
    });

    // Then the ciphertext stays put and the record says why.
    assertIdentical(readValue(simAws), "dummy-value-for-/myapp/token");
    assertStringIncludes(parameterRecord(stack).reason, "SecureString");
  });

  it("deploys a list Parameter with a stand-in list", async () => {
    // Given nothing in Parameter Store.
    const simAws = simAwsInEuWest2();

    // When a list-typed Parameter names a parameter that is not there.
    const stack = await deployReading({
      simAws,
      type: "AWS::SSM::Parameter::Value<List<String>>",
      name: "/myapp/db-hosts",
      value: { "Fn::Select": [0, { Ref: "DbHostParameter" }] },
    });

    // Then the stand-in is a list of one, so the list functions still read it.
    assertIdentical(readValue(simAws), "dummy-value-for-/myapp/db-hosts");
    assertStringIncludes(parameterRecord(stack).reason, "/myapp/db-hosts");
  });
});
