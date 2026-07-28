/* eslint-disable @typescript-eslint/naming-convention -- environment
 * variable names are UPPER_SNAKE_CASE by AWS convention, not code
 * identifier names. */
import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";

const emptyBytes = new Uint8Array();

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

/**
 * A handler reading the parameter whose name its environment carries, as an
 * application fetching its configuration on a cold start does.
 */
const readParameterHandlerSource = `
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
const client = new SSMClient({});
exports.handler = async () => {
  const output = await client.send(
    new GetParameterCommand({ Name: process.env.DB_HOST_PARAMETER }),
  );
  return { host: output.Parameter.Value };
};
`;

/**
 * The parameter's ARN, written as CloudFormation would substitute it. The
 * leading slash of the name is dropped, so there is one slash after
 * `parameter` rather than two.
 */
const parameterArnSubstitution =
  // eslint-disable-next-line no-template-curly-in-string -- Fn::Sub syntax, not a JavaScript template.
  "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/myapp/prod/db-host";

function readerRole(
  parameterArn: SimCfnTemplateValue,
): CfnTemplateBodyRecord["Resources"] {
  return {
    ReaderRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: "ConfigReaderRole",
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
        Policies: [
          {
            PolicyName: "ReadDbHost",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: "ssm:GetParameter",
                  Resource: parameterArn,
                },
              ],
            },
          },
        ],
      },
    },
  };
}

/**
 * A stack holding a parameter and a Lambda handed its name, with the
 * function's execution Role allowed to read exactly that parameter.
 */
const template: CfnTemplateBodyRecord = {
  Resources: {
    DbHost: {
      Type: "AWS::SSM::Parameter",
      Properties: {
        Name: "/myapp/prod/db-host",
        Type: "String",
        Value: "db.internal",
      },
    },
    ...readerRole({ "Fn::Sub": parameterArnSubstitution }),
    ReaderFunction: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: "config-reader",
        Role: { "Fn::GetAtt": ["ReaderRole", "Arn"] },
        Handler: "index.handler",
        Runtime: "nodejs20.x",
        Code: { ZipFile: readParameterHandlerSource },
        Environment: {
          Variables: { DB_HOST_PARAMETER: { Ref: "DbHost" } },
        },
      },
    },
  },
};

describe("SSM CloudFormation Parameter with Lambda", () => {
  it("hands a Lambda the parameter name to read its value", async () => {
    // Given a stack with a parameter, a Lambda holding its name in the
    // environment, and an execution Role allowed to read it.
    const simAws = new SimAws();

    // When the stack is deployed and the function is invoked.
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "config-stack", template });
    await stack.waitForDeployComplete();

    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "config-reader" }));

    // Then the handler read the deployed value out of simulated Parameter
    // Store as its execution Role, which is what a Ref to a parameter is for.
    assertUndefined(invoked.FunctionError);

    const payload = Buffer.from(invoked.Payload ?? emptyBytes).toString("utf8");
    assertIdentical(payload, JSON.stringify({ host: "db.internal" }));
  });

  it("denies a Lambda whose Role names the parameter with a doubled slash", async () => {
    // Given the same stack, except that the Role's policy keeps the name's
    // leading slash after `parameter`, as a hand-written policy easily does.
    const simAws = new SimAws();
    const doubledSlashTemplate: CfnTemplateBodyRecord = {
      Resources: {
        ...template.Resources,
        ...readerRole({
          "Fn::Sub":
            // eslint-disable-next-line no-template-curly-in-string -- Fn::Sub syntax, not a JavaScript template.
            "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter//myapp/prod/db-host",
        }),
      },
    };

    // When the stack is deployed and the function is invoked.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "config-stack",
      template: doubledSlashTemplate,
    });
    await stack.waitForDeployComplete();

    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "config-reader" }));

    // Then the read is denied, exactly as it would be on real AWS, where a
    // parameter ARN has one slash after `parameter`.
    assertIdentical(invoked.FunctionError, "Unhandled");

    const payload = Buffer.from(invoked.Payload ?? emptyBytes).toString("utf8");
    assertStringIncludes(payload, "not authorized");
  });
});
