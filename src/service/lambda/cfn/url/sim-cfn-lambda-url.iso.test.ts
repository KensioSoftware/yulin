import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertStringMatches,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimLambdaFunctionUrl } from "../../function/url/sim-lambda-function-url.js";

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

function greeterTemplate(
  urlProperties: SimCfnTemplateValueRecord,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      GreeterRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "GreeterRole",
          AssumeRolePolicyDocument: assumeRolePolicyDocument,
        },
      },
      GreeterFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "greeter",
          Role: { "Fn::GetAtt": ["GreeterRole", "Arn"] },
          Code: {
            ZipFile:
              "exports.handler = async (event) => " +
              "({ statusCode: 200, body: 'Hello ' + event.rawPath });",
          },
          Handler: "index.handler",
          Runtime: "nodejs22.x",
        },
      },
      GreeterUrl: {
        Type: "AWS::Lambda::Url",
        Properties: urlProperties,
      },
    },
    Outputs: {
      FunctionUrl: {
        Value: { "Fn::GetAtt": ["GreeterUrl", "FunctionUrl"] },
      },
      FunctionArn: {
        Value: { "Fn::GetAtt": ["GreeterUrl", "FunctionArn"] },
      },
      UnsupportedAttribute: {
        Value: { "Fn::GetAtt": ["GreeterUrl", "Nonsense"] },
      },
      UrlRef: {
        Value: { Ref: "GreeterUrl" },
      },
    },
  };
}

describe("Lambda CloudFormation Function URL deployment", () => {
  it("creates a servable Function URL from AWS::Lambda::Url", async () => {
    // Given a template with a function and a Function URL targeting it.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: greeterTemplate({
        TargetFunctionArn: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
        AuthType: "NONE",
      }),
    });
    await stack.waitForDeployComplete();

    // Then the Resource is backed by a simulated Function URL that serves the
    // deployed function.
    const urlResource = stack.getResource("GreeterUrl");
    assertNonNullable(urlResource);
    const functionUrl = urlResource.simResource;
    assertInstanceOf(functionUrl, SimLambdaFunctionUrl);

    const response = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({ input: `${functionUrl.url}hello` }).toString(),
    );
    assertIdentical(await response.text(), "Hello /hello");
  });

  it("resolves Fn::GetAtt FunctionUrl and FunctionArn", async () => {
    // Given a deployed stack with a Function URL.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: greeterTemplate({
        TargetFunctionArn: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
        AuthType: "NONE",
      }),
    });
    await stack.waitForDeployComplete();

    // When the stack outputs are read.
    const output = stack.outputs.get("FunctionUrl")?.value;

    // Then the endpoint URL is what Fn::GetAtt FunctionUrl resolved to.
    assertStringMatches(
      output,
      /^https:\/\/[a-z0-9]{32}\.lambda-url\.us-east-1\.on\.aws\/$/,
    );

    // And Ref resolves to the same endpoint.
    assertIdentical(stack.outputs.get("UrlRef")?.value, output);

    // And Fn::GetAtt FunctionArn resolves to the target function.
    assertIdentical(
      stack.outputs.get("FunctionArn")?.value,
      simAws.lambda().getSimFunctionUrl("greeter")?.functionArn,
    );

    // And an attribute AWS::Lambda::Url does not have resolves to a
    // recognisable placeholder rather than failing the deployment.
    assertIdentical(
      stack.outputs.get("UnsupportedAttribute")?.value,
      `${output}.Nonsense`,
    );
  });

  it("accepts a Ref to the function as the target", async () => {
    // Given a template pointing at the function by Ref, which is its name.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: greeterTemplate({
        TargetFunctionArn: { Ref: "GreeterFunction" },
        AuthType: "NONE",
      }),
    });
    await stack.waitForDeployComplete();

    // Then the Function URL belongs to the named function.
    const functionUrl = simAws.lambda().getSimFunctionUrl("greeter");
    assertNonNullable(functionUrl);
    assertStringIncludes(functionUrl.functionArn, ":function:greeter");
  });

  it("carries the template auth type and invoke mode", async () => {
    // Given a template with a non-default Function URL configuration.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: greeterTemplate({
        TargetFunctionArn: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
        AuthType: "AWS_IAM",
        InvokeMode: "RESPONSE_STREAM",
      }),
    });
    await stack.waitForDeployComplete();

    // Then the created Function URL has that configuration.
    const functionUrl = simAws.lambda().getSimFunctionUrl("greeter");
    assertNonNullable(functionUrl);
    assertIdentical(functionUrl.authType, "AWS_IAM");
    assertIdentical(functionUrl.invokeMode, "RESPONSE_STREAM");
  });

  it("fails the Resource when TargetFunctionArn is missing", async () => {
    // Given a template whose Function URL names no target function.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "greeter-stack",
        template: greeterTemplate({ AuthType: "NONE" }),
      });
      await stack.waitForDeployComplete();
    });

    // Then the failure names the Resource type, property and logical ID.
    assertStringIncludes(
      error.message,
      "Invalid AWS::Lambda::Url GreeterUrl: TargetFunctionArn must be a string",
    );
  });
});
