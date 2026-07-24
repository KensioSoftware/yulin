import { GetFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimIamRole } from "../../iam/role/sim-iam-role.js";
import { makeLambdaCodeZip } from "../function/code/make-lambda-code-zip.js";
import type { SimLambdaFunction } from "../function/sim-lambda-function.js";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: {
        Service: "lambda.amazonaws.com",
      },
      Action: "sts:AssumeRole",
    },
  ],
};

describe("Lambda CloudFormation Function deployment", () => {
  it("creates an invokable function with a same-stack IAM Role", async () => {
    // Given a CloudFormation template declaring an IAM Role and a Lambda
    // function that references it via Fn::GetAtt, with inline ZipFile source.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: {
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
              Role: {
                "Fn::GetAtt": ["GreeterRole", "Arn"],
              },
              Code: {
                ZipFile:
                  "exports.handler = async (event) => 'Hello ' + event.name;",
              },
              Handler: "index.handler",
              Runtime: "nodejs20.x",
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the CloudFormation Resource is backed by a simulated function.
    const roleResource = stack.getResource("GreeterRole");
    const functionResource = stack.getResource("GreeterFunction");

    assertNonNullable(roleResource);
    assertNonNullable(functionResource);

    const role = roleResource.simResource as SimIamRole | undefined;
    const simFunction = functionResource.simResource as
      SimLambdaFunction | undefined;

    assertNonNullable(role);
    assertNonNullable(simFunction);
    assertIdentical(
      simAws.lambda().getSimFunctionByName("greeter"),
      simFunction,
    );

    // And the function's execution Role resolved to the same-stack Role ARN.
    assertIdentical(simFunction.roleArn, role.arn);

    // And the function is retrievable through the Lambda GetFunction API.
    const retrievedFunction = await simAws
      .lambda()
      .getFunction(new GetFunctionCommand({ FunctionName: "greeter" }));

    assertIdentical(retrievedFunction.Configuration.FunctionName, "greeter");
    assertIdentical(retrievedFunction.Configuration.Role, role.arn);

    // And the inline ZipFile source is invokable via the Lambda Invoke API.
    const invokeOutput = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "greeter",
        Payload: JSON.stringify({ name: "Yulin" }),
      }),
    );

    assertIdentical(invokeOutput.StatusCode, 200);
    assertNonNullable(invokeOutput.Payload);
    assertIdentical(
      JSON.parse(Buffer.from(invokeOutput.Payload).toString()),
      "Hello Yulin",
    );

    await simAws.backgroundTasksComplete();
  });

  it("uses the function name for Ref and exposes Arn via Fn::GetAtt", async () => {
    // Given a CloudFormation template with a function, a dependent resource,
    // and Outputs that exercise Ref and Fn::GetAtt resolution.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "function-ref-stack",
      template: {
        Resources: {
          OutputFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "output-function",
              Role: "arn:aws:iam::111111111111:role/OutputFunctionRole",
              Code: {
                ZipFile: "exports.handler = async () => 'output';",
              },
              Handler: "index.handler",
            },
          },
          WaitHandle: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
            Properties: {
              FunctionName: {
                Ref: "OutputFunction",
              },
              FunctionArn: {
                "Fn::GetAtt": ["OutputFunction", "Arn"],
              },
              FunctionUnknownAttribute: {
                "Fn::GetAtt": ["OutputFunction", "MemorySize"],
              },
            },
          },
        },
        Outputs: {
          FunctionName: {
            Value: {
              Ref: "OutputFunction",
            },
          },
          FunctionArn: {
            Value: {
              "Fn::GetAtt": ["OutputFunction", "Arn"],
            },
          },
        },
      },
    });

    // Then Ref returns the function name and Fn::GetAtt returns the ARN.
    const functionResource = stack.getResource("OutputFunction");
    const waitHandleResource = stack.getResource("WaitHandle");

    assertNonNullable(functionResource);
    assertNonNullable(waitHandleResource);

    const simFunction = functionResource.simResource as SimLambdaFunction;

    assertIdentical(functionResource.refValue, "output-function");

    const resolvedWaitHandleProperties = waitHandleResource.resolvedProperties({
      simAws,
      resources: stack.resources,
    });

    assertIdentical(
      resolvedWaitHandleProperties["FunctionName"],
      "output-function",
    );
    assertIdentical(
      resolvedWaitHandleProperties["FunctionArn"],
      simFunction.arn,
    );

    // And unsupported Fn::GetAtt attributes fall back to an ARN-derived value.
    assertIdentical(
      resolvedWaitHandleProperties["FunctionUnknownAttribute"],
      `${simFunction.arn}.MemorySize`,
    );

    assertIdentical(
      stack.outputs.get("FunctionName")?.value,
      "output-function",
    );
    assertIdentical(stack.outputs.get("FunctionArn")?.value, simFunction.arn);

    await simAws.backgroundTasksComplete();
  });

  it("skips functions coded from a missing CDK bootstrap assets bucket", async () => {
    // Given a CDK-synthesized style template with a helper function whose
    // code zip lives in the CDK bootstrap assets bucket, which does not exist
    // in sim AWS.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "cdk-assets-stack",
      template: {
        Resources: {
          DeploymentProviderFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              Role: "arn:aws:iam::111111111111:role/ProviderRole",
              Code: {
                S3Bucket: "cdk-hnb659fds-assets-111111111111-eu-west-2",
                S3Key: "asset.zip",
              },
              Handler: "index.handler",
            },
          },
        },
      },
    });

    // Then the function Resource is skipped rather than failing the stack.
    const functionResource = stack.getResource("DeploymentProviderFunction");

    assertNonNullable(functionResource);
    assertTrue(functionResource.skipped);
    assertNonNullable(functionResource.skippedReason);
    assertStringIncludes(
      functionResource.skippedReason,
      "cdk-hnb659fds-assets-111111111111-eu-west-2",
    );
    assertUndefined(
      simAws.lambda().getSimFunctionByName("DeploymentProviderFunction"),
    );

    await simAws.backgroundTasksComplete();
  });

  it("fails AWS-like when a non-CDK code bucket does not exist", async () => {
    // Given a template with a function coded from a missing user bucket.
    const simAws = new SimAws();

    // When the template is deployed, then the deploy fails with the AWS-like
    // missing bucket diagnostic rather than being skipped.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "missing-code-bucket-stack",
        template: {
          Resources: {
            MissingCodeFunction: {
              Type: "AWS::Lambda::Function",
              Properties: {
                Role: "arn:aws:iam::111111111111:role/MissingCodeRole",
                Code: {
                  S3Bucket: "missing-code-bucket",
                  S3Key: "greeter.zip",
                },
                Handler: "index.handler",
              },
            },
          },
        },
      }),
    );

    assertStringIncludes(error.message, "NoSuchBucket");
    assertUndefined(
      simAws.lambda().getSimFunctionByName("MissingCodeFunction"),
    );
  });

  it("creates a function from a code zip stored in sim S3", async () => {
    // Given a code zip archive stored in sim S3, as SAM and CDK deploy.
    const simAws = new SimAws();
    const codeZip = makeLambdaCodeZip(
      "exports.handler = async (event) => 'Hello ' + event.name + ' from S3';",
    );
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "code-bucket" }));
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "code-bucket",
        Key: "artifacts/greeter.zip",
        Body: codeZip,
      }),
    );

    // When a template referencing the S3 code location is deployed.
    await simAws.cloudFormation().deployTemplate({
      stackName: "s3-code-stack",
      template: {
        Resources: {
          S3Greeter: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "s3-greeter",
              Role: "arn:aws:iam::111111111111:role/S3GreeterRole",
              Code: {
                S3Bucket: "code-bucket",
                S3Key: "artifacts/greeter.zip",
              },
              Handler: "index.handler",
            },
          },
        },
      },
    });

    // Then the stored code runs in the simulated runtime.
    const invokeOutput = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "s3-greeter",
        Payload: JSON.stringify({ name: "Yulin" }),
      }),
    );

    assertIdentical(invokeOutput.StatusCode, 200);
    assertNonNullable(invokeOutput.Payload);
    assertIdentical(
      JSON.parse(Buffer.from(invokeOutput.Payload).toString()),
      "Hello Yulin from S3",
    );

    await simAws.backgroundTasksComplete();
  });
});
