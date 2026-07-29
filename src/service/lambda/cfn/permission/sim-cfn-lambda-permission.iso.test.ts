import { GetPolicyCommand } from "@aws-sdk/client-lambda";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { assertTypeString } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simAwsCallerHeaderName } from "../../../iam/request/sim-aws-caller-header.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimLambdaPermission } from "../../function/policy/sim-lambda-permission.js";
import { SimCfnLambdaPermissionCreator } from "./sim-cfn-lambda-permission-creator.js";

const callerAccountId = "222222222222";
const callerRoleArn = `arn:aws:iam::${callerAccountId}:role/Caller`;

function greeterTemplate(
  permissionProperties: SimCfnTemplateValueRecord,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      GreeterFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "greeter",
          Role: "arn:aws:iam::888888888888:role/GreeterRole",
          Code: {
            ZipFile:
              "exports.handler = async () => ({ statusCode: 200, body: 'ok' });",
          },
          Handler: "index.handler",
          Runtime: "nodejs22.x",
        },
      },
      GreeterUrl: {
        Type: "AWS::Lambda::Url",
        Properties: {
          TargetFunctionArn: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
          AuthType: "AWS_IAM",
        },
      },
      GreeterInvokePermission: {
        Type: "AWS::Lambda::Permission",
        Properties: permissionProperties,
      },
    },
    Outputs: {
      FunctionUrl: {
        Value: { "Fn::GetAtt": ["GreeterUrl", "FunctionUrl"] },
      },
    },
  };
}

describe("Lambda CloudFormation Permission deployment", () => {
  it("creates a function permission from AWS::Lambda::Permission", async () => {
    // Given a template granting another Account's Role the Function URL
    const simAws = new SimAws();

    // When the template is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: greeterTemplate({
        FunctionName: { Ref: "GreeterFunction" },
        Action: "lambda:InvokeFunctionUrl",
        Principal: callerRoleArn,
        FunctionUrlAuthType: "AWS_IAM",
      }),
    });
    await stack.waitForDeployComplete();

    // Then the Resource is backed by a simulated permission, named after its
    // logical ID as CloudFormation names the statement
    const permission = stack.getResource(
      "GreeterInvokePermission",
    )?.simResource;
    expect(permission).toBeInstanceOf(SimLambdaPermission);

    const policy = await simAws
      .lambda()
      .getPolicy(new GetPolicyCommand({ FunctionName: "greeter" }));
    expect(JSON.parse(policy.Policy)).toMatchObject({
      Statement: [
        {
          Sid: "GreeterInvokePermission",
          Effect: "Allow",
          Principal: { AWS: callerRoleArn },
          Action: "lambda:InvokeFunctionUrl",
        },
      ],
    });
  });

  it("takes effect for a request to the deployed Function URL", async () => {
    // Given the same template deployed, with the URL requiring IAM auth, and
    // the granted Role allowed to invoke Function URLs by its own Account
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: greeterTemplate({
        FunctionName: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
        Action: "lambda:InvokeFunctionUrl",
        Principal: callerRoleArn,
        FunctionUrlAuthType: "AWS_IAM",
      }),
    });
    await stack.waitForDeployComplete();
    // And the calling Role in its own Account, allowed to invoke Function URLs
    // there. A cross-Account call needs an allow from the caller's Account as
    // well as the grant on the function, so the template grant can only be
    // shown to take effect with this side in place too.
    const callerIam = simAws.account(callerAccountId).iam();
    await callerIam.createRole(
      new CreateRoleCommand({
        RoleName: "Caller",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${callerAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await callerIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Caller",
        PolicyName: "InvokeUrl",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "lambda:InvokeFunctionUrl", Resource: "*" },
        }),
      }),
    );
    const functionUrl = stack.outputs.get("FunctionUrl")?.value;
    assertTypeString(functionUrl);
    const url = new SimAwsLocalUrl({ input: functionUrl }).toString();
    const simAwsHttp = new SimAwsHttp({ simAws });

    // When the granted Role calls it, and when another principal does
    const granted = await simAwsHttp.fetch(url, {
      headers: { [simAwsCallerHeaderName]: callerRoleArn },
    });
    const ungranted = await simAwsHttp.fetch(url, {
      headers: {
        [simAwsCallerHeaderName]: "arn:aws:iam::222222222222:role/Stranger",
      },
    });

    // Then the template grant is what decides, exactly as an AddPermission
    // call would: a CDK app's grantInvokeUrl needs no special casing
    expect(granted.status).toBe(200);
    expect(ungranted.status).toBe(403);
  });

  it("writes the conditions a template's qualifying properties imply", async () => {
    // Given a template restricting an Invoke grant to Function URL requests
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: greeterTemplate({
        FunctionName: { Ref: "GreeterFunction" },
        Action: "lambda:InvokeFunction",
        Principal: "s3.amazonaws.com",
        SourceArn: "arn:aws:s3:::reports-bucket",
        SourceAccount: "222222222222",
        InvokedViaFunctionUrl: true,
      }),
    });
    await stack.waitForDeployComplete();

    // Then the statement carries each of them, so GetPolicy reports the grant
    // that was made even though the simulator supplies no value for them and
    // they therefore never match
    const policy = await simAws
      .lambda()
      .getPolicy(new GetPolicyCommand({ FunctionName: "greeter" }));
    expect(JSON.parse(policy.Policy)).toMatchObject({
      Statement: [
        {
          Principal: { Service: "s3.amazonaws.com" },
          Condition: {
            StringEquals: { "AWS:SourceAccount": "222222222222" },
            ArnLike: { "AWS:SourceArn": "arn:aws:s3:::reports-bucket" },
            Bool: { "lambda:InvokedViaFunctionUrl": true },
          },
        },
      ],
    });
  });

  it("refuses a template property of the wrong type", async () => {
    // Given a Permission Resource whose InvokedViaFunctionUrl is a string
    const simAws = new SimAws();
    const creator = new SimCfnLambdaPermissionCreator({
      lambda: simAws.lambda(),
    });
    const resource = new SimCfnResource({
      accountRegionScope: {
        accountId: "888888888888" as SimAwsAccountId,
        regionName: "us-east-1",
      },
      logicalId: "BadPermission",
      template: {
        Type: "AWS::Lambda::Permission",
        Properties: {},
      },
    });

    // When it is created
    // Then it fails with a diagnostic naming the property and the logical ID,
    // rather than the wrong type reaching the policy
    await expect(
      creator.create(resource, {
        FunctionName: "greeter",
        Action: "lambda:InvokeFunction",
        Principal: "s3.amazonaws.com",
        InvokedViaFunctionUrl: "yes",
      }),
    ).rejects.toThrow(
      "Invalid AWS::Lambda::Permission BadPermission: " +
        "InvokedViaFunctionUrl must be a boolean",
    );
  });
});
