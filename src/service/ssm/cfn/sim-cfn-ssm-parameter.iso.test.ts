import { GetParameterCommand } from "@aws-sdk/client-ssm";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimSsmParameter } from "../parameter/sim-ssm-parameter.js";

const accountIdOneOnes = "111111111111" as SimAwsAccountId;

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

describe("SSM CloudFormation Parameter deployment", () => {
  it("creates a parameter at version 1 from the template properties", async () => {
    // Given a template declaring a parameter.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "config-stack",
      template: {
        Resources: {
          DbHost: {
            Type: "AWS::SSM::Parameter",
            Properties: {
              Name: "/myapp/prod/db-host",
              Type: "String",
              Value: "db.internal",
              Description: "Where the application database lives",
              Tier: "Standard",
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the parameter reads back as an SDK caller would read it, at the
    // first version, because the deployment created it.
    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "/myapp/prod/db-host" }));

    assertNonNullable(read.Parameter);
    assertIdentical(read.Parameter.Value, "db.internal");
    assertIdentical(read.Parameter.Type, "String");
    assertIdentical(read.Parameter.Version, 1);
    assertIdentical(
      read.Parameter.ARN,
      "arn:aws:ssm:eu-west-2:111111111111:parameter/myapp/prod/db-host",
    );

    // And the Description the template declared is reported back.
    const described = await simAws.ssm().describeParameters({ input: {} });
    assertIdentical(
      described.Parameters?.at(0)?.Description,
      "Where the application database lives",
    );
  });

  it("resolves Ref to the parameter name and Fn::GetAtt to its Type and Value", async () => {
    // Given a template referencing its parameter every way it can.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "config-stack",
      template: {
        Resources: {
          DbHost: {
            Type: "AWS::SSM::Parameter",
            Properties: {
              Name: "/myapp/prod/db-host",
              Type: "String",
              Value: "db.internal",
            },
          },
        },
        Outputs: {
          ParameterRef: { Value: { Ref: "DbHost" } },
          ParameterType: { Value: { "Fn::GetAtt": ["DbHost", "Type"] } },
          ParameterValue: { Value: { "Fn::GetAtt": ["DbHost", "Value"] } },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then Ref is the name, as AWS::SSM::Parameter Ref is, so it can be
    // handed straight to GetParameter.
    assertIdentical(
      stack.outputs.get("ParameterRef")?.value,
      "/myapp/prod/db-host",
    );
    assertIdentical(stack.outputs.get("ParameterType")?.value, "String");
    assertIdentical(stack.outputs.get("ParameterValue")?.value, "db.internal");
  });

  it("names an unnamed parameter after its logical ID", async () => {
    // Given a template leaving Name out, as CDK does for a parameter with no
    // explicit name.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "config-stack",
      template: {
        Resources: {
          FeatureFlags: {
            Type: "AWS::SSM::Parameter",
            Properties: { Type: "StringList", Value: "beta,canary" },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the parameter is named after its logical ID, as sim CloudFormation
    // names other unnamed resources.
    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "FeatureFlags" }));

    assertNonNullable(read.Parameter);
    assertIdentical(read.Parameter.Value, "beta,canary");
    assertIdentical(read.Parameter.Type, "StringList");
  });

  it("backs the CloudFormation Resource with the simulated parameter", async () => {
    // Given a deployed parameter.
    const simAws = simAwsInEuWest2();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "config-stack",
      template: {
        Resources: {
          DbHost: {
            Type: "AWS::SSM::Parameter",
            Properties: {
              Name: "/myapp/prod/db-host",
              Type: "String",
              Value: "db.internal",
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // When the Resource is inspected.
    const resource = stack.getResource("DbHost");
    assertNonNullable(resource);

    // Then it is backed by the same simulated parameter the service holds,
    // rather than some other simulated resource that happens to have an ARN.
    const parameter = resource.simResource;
    assertInstanceOf(parameter, SimSsmParameter);
    assertIdentical(
      simAws.ssm().findParameter("/myapp/prod/db-host")?.arn.value,
      parameter.arn.value,
    );
  });

  it("creates the parameter in the stack's account and region", async () => {
    // Given a simulated AWS whose default scope is not the stack's.
    const simAws = new SimAws();

    // When a template is deployed into another account and region.
    const stack = await simAws
      .account(accountIdOneOnes)
      .region("us-east-1")
      .cloudFormation()
      .deployTemplate({
        stackName: "config-stack",
        template: {
          Resources: {
            DbHost: {
              Type: "AWS::SSM::Parameter",
              Properties: {
                Name: "/myapp/prod/db-host",
                Type: "String",
                Value: "db.internal",
              },
            },
          },
        },
      });
    await stack.waitForDeployComplete();

    // Then the parameter exists in that account and region, and nowhere else.
    const scoped = simAws
      .account(accountIdOneOnes)
      .region("us-east-1")
      .ssm()
      .findParameter("/myapp/prod/db-host");

    assertNonNullable(scoped);
    assertIdentical(
      scoped.arn.value,
      "arn:aws:ssm:us-east-1:111111111111:parameter/myapp/prod/db-host",
    );
    assertUndefined(simAws.ssm().findParameter("/myapp/prod/db-host"));
  });
});
