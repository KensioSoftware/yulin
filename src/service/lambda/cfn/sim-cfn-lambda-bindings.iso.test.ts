import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

function parsePayload(payload: Uint8Array | undefined): unknown {
  assertNonNullable(payload);
  return JSON.parse(Buffer.from(payload).toString()) as unknown;
}

describe("Lambda CloudFormation Function bindings", () => {
  it("binds a real in-process handler by logical ID", async () => {
    // Given a template function bound to a real handler that closes over
    // test state, with template Code and Handler omitted entirely.
    const simAws = new SimAws();
    const observedEvents: unknown[] = [];

    // When the template is deployed with the binding.
    await simAws.cloudFormation().deployTemplate({
      stackName: "bound-greeter-stack",
      template: {
        Resources: {
          GreeterFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "bound-greeter",
              Role: "arn:aws:iam::111111111111:role/BoundGreeterRole",
            },
          },
        },
      },
      bindings: [
        {
          logicalId: "GreeterFunction",
          handler: (event: { name: string }) => {
            observedEvents.push(event);
            return `Hello ${event.name} from bound handler`;
          },
        },
      ],
    });

    // Then invoking the deployed function runs the bound handler in-process.
    const output = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "bound-greeter",
        Payload: JSON.stringify({ name: "Yulin" }),
      }),
    );

    assertIdentical(output.StatusCode, 200);
    assertIdentical(
      parsePayload(output.Payload),
      "Hello Yulin from bound handler",
    );
    assertArrayLength(observedEvents, 1);

    await simAws.backgroundTasksComplete();
  });

  it("binds by function name, replacing template code", async () => {
    // Given a template function with placeholder inline code and a binding
    // targeting its FunctionName.
    const simAws = new SimAws();

    // When the template is deployed with the binding.
    await simAws.cloudFormation().deployTemplate({
      stackName: "name-bound-stack",
      template: {
        Resources: {
          NamedFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "named-function",
              Role: "arn:aws:iam::111111111111:role/NamedFunctionRole",
              Handler: "index.handler",
              Code: {
                ZipFile: "exports.handler = async () => 'template code';",
              },
            },
          },
        },
      },
      bindings: [
        {
          functionName: "named-function",
          handler: () => "bound instead of template code",
        },
      ],
    });

    // Then the bound handler replaces the template code.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "named-function" }));

    assertIdentical(
      parsePayload(output.Payload),
      "bound instead of template code",
    );

    await simAws.backgroundTasksComplete();
  });

  it("binds by function ARN", async () => {
    // Given a binding targeting the function's ARN in the deploy scope.
    const simAws = new SimAws();
    const functionArn =
      `arn:aws:lambda:${simAws.defaultRegionName}:` +
      `${simAws.defaultAccountId}:function:arn-bound-function`;

    // When the template is deployed with the binding, alongside a
    // non-executable resource the binding matcher must pass over.
    await simAws.cloudFormation().deployTemplate({
      stackName: "arn-bound-stack",
      template: {
        Resources: {
          DataBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "arn-bound-data-bucket",
            },
          },
          ArnBoundFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "arn-bound-function",
              Role: "arn:aws:iam::111111111111:role/ArnBoundRole",
            },
          },
        },
      },
      bindings: [
        {
          arn: functionArn,
          handler: () => "bound by arn",
        },
      ],
    });

    // Then the bound handler backs the function.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "arn-bound-function" }));

    assertIdentical(parsePayload(output.Payload), "bound by arn");

    await simAws.backgroundTasksComplete();
  });

  it("binds by CDK construct ID from path metadata", async () => {
    // Given a CDK-synthesized style template with a hashed logical ID and
    // construct path metadata, and a binding using the readable construct ID.
    const simAws = new SimAws();

    // When the template is deployed with the binding.
    await simAws.cloudFormation().deployTemplate({
      stackName: "cdk-bound-stack",
      template: {
        Resources: {
          ReaderFunction2A1B3C4D: {
            Type: "AWS::Lambda::Function",
            Metadata: {
              "aws:cdk:path": "TestStack/ReaderFunction/Resource",
            },
            Properties: {
              Role: "arn:aws:iam::111111111111:role/ReaderFunctionRole",
              Handler: "index.handler",
              Code: {
                ZipFile: "exports.handler = async () => 'template code';",
              },
            },
          },
        },
      },
      bindings: [
        {
          logicalId: "ReaderFunction",
          handler: () => "bound via construct id",
        },
      ],
    });

    // Then the bound handler backs the function created under the hashed
    // logical ID.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "ReaderFunction2A1B3C4D" }));

    assertIdentical(parsePayload(output.Payload), "bound via construct id");

    await simAws.backgroundTasksComplete();
  });

  it("binds by CDK construct path", async () => {
    // Given a binding targeting the full CDK construct path from synthesized
    // template metadata.
    const simAws = new SimAws();

    // When the template is deployed with the binding.
    await simAws.cloudFormation().deployTemplate({
      stackName: "cdk-path-bound-stack",
      template: {
        Resources: {
          PathBoundFunction9F8E7D6C: {
            Type: "AWS::Lambda::Function",
            Metadata: {
              "aws:cdk:path": "TestStack/PathBoundFunction/Resource",
            },
            Properties: {
              FunctionName: "path-bound-function",
              Role: "arn:aws:iam::111111111111:role/PathBoundRole",
            },
          },
        },
      },
      bindings: [
        {
          cdkPath: "TestStack/PathBoundFunction/Resource",
          handler: () => "bound by cdk path",
        },
      ],
    });

    // Then the bound handler backs the function.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "path-bound-function" }));

    assertIdentical(parsePayload(output.Payload), "bound by cdk path");

    await simAws.backgroundTasksComplete();
  });

  it("leaves unbound functions on their template code", async () => {
    // Given two template functions with only one bound.
    const simAws = new SimAws();

    // When the template is deployed with the single binding.
    await simAws.cloudFormation().deployTemplate({
      stackName: "partially-bound-stack",
      template: {
        Resources: {
          BoundFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "bound-function",
              Role: "arn:aws:iam::111111111111:role/BoundRole",
            },
          },
          UnboundFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "unbound-function",
              Role: "arn:aws:iam::111111111111:role/UnboundRole",
              Handler: "index.handler",
              Code: {
                ZipFile: "exports.handler = async () => 'vm template code';",
              },
            },
          },
        },
      },
      bindings: [
        {
          logicalId: "BoundFunction",
          handler: () => "bound handler",
        },
      ],
    });

    // Then the bound function runs the binding and the unbound function
    // still runs its template code in the vm.
    const boundOutput = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "bound-function" }));
    const unboundOutput = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "unbound-function" }));

    assertIdentical(parsePayload(boundOutput.Payload), "bound handler");
    assertIdentical(parsePayload(unboundOutput.Payload), "vm template code");

    await simAws.backgroundTasksComplete();
  });

  it("rejects bindings that do not target any resource", async () => {
    // Given a binding whose function name matches nothing in the template.
    const simAws = new SimAws();

    // When the template is deployed, then binding validation rejects it with
    // the unmatched target for diagnosis.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "unmatched-binding-stack",
        template: {
          Resources: {
            SomeFunction: {
              Type: "AWS::Lambda::Function",
              Properties: {
                FunctionName: "some-function",
                Role: "arn:aws:iam::111111111111:role/SomeRole",
              },
            },
          },
        },
        bindings: [
          {
            functionName: "no-such-function",
            handler: () => "never runs",
          },
        ],
      }),
    );

    assertStringIncludes(error.message, "no-such-function");
    assertStringIncludes(error.message, "does not resolve to a Resource");
  });
});
