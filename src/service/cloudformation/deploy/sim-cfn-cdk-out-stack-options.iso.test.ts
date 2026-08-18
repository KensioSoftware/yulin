import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import {
  assemblyStackBucketName,
  simCdkCloudAssemblyFactory,
} from "../cdk/sim-cdk-cloud-assembly.factory.js";
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";

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

const functionStackResources: SimCfnTemplateValueRecord = {
  GreeterRole: {
    Type: "AWS::IAM::Role",
    Properties: {
      RoleName: "greeter-role",
      AssumeRolePolicyDocument: assumeRolePolicyDocument,
    },
  },
  GreeterFunction: {
    Type: "AWS::Lambda::Function",
    Properties: {
      FunctionName: "greeter",
      Role: { "Fn::GetAtt": ["GreeterRole", "Arn"] },
      Code: { ZipFile: "exports.handler = async () => 'synthesized';" },
      Handler: "index.handler",
      Runtime: "nodejs22.x",
    },
  },
};

describe("Deploying a CDK cloud assembly with per-Stack options [iso]", () => {
  it("binds a handler to the Stack the binding is keyed against", async () => {
    // Given an assembly holding a Stack with a function in it, beside another.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [
        {
          artifactId: "ApiStack",
          regionName: "eu-west-2",
          resources: functionStackResources,
        },
        { artifactId: "SiteStack", regionName: "eu-west-2" },
      ],
    });

    // When the assembly is deployed with a handler bound to that one Stack.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    await simAws.cloudFormation().deployCdkOut({
      directoryPath: directory.join("cdk.out"),
      stackOptions: {
        ApiStack: {
          bindings: [
            { logicalId: "GreeterFunction", handler: () => "bound in process" },
          ],
        },
      },
    });

    // Then invoking the deployed function runs the bound handler.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "greeter" }));

    assertNonNullable(output.Payload);
    assertIdentical(
      Buffer.from(output.Payload).toString(),
      '"bound in process"',
    );
  });

  it("transforms only the Stack the transform is keyed against", async () => {
    // Given an assembly holding two Stacks that each create a Bucket.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [
        { artifactId: "SiteStack", regionName: "eu-west-2" },
        { artifactId: "DataStack", regionName: "eu-west-2" },
      ],
    });

    // When one of them is deployed through a transform that renames its Bucket.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    await simAws.cloudFormation().deployCdkOut({
      directoryPath: directory.join("cdk.out"),
      stackOptions: {
        SiteStack: {
          transform: (template) => ({
            ...template,
            Resources: {
              SiteStackBucket: {
                Type: "AWS::S3::Bucket",
                Properties: { BucketName: "renamed-by-transform" },
              },
            },
          }),
        },
      },
    });

    // Then that Stack deployed what the transform returned.
    const s3 = simAws.region("eu-west-2").s3();

    assertNonNullable(s3.getSimBucketByName("renamed-by-transform"));
    assertUndefined(
      s3.getSimBucketByName(assemblyStackBucketName("SiteStack")),
    );

    // And the Stack the transform was not keyed against deployed its own.
    assertNonNullable(
      s3.getSimBucketByName(assemblyStackBucketName("DataStack")),
    );
  });

  it("fails when options name a Stack that is not being deployed", async () => {
    // Given an assembly whose Stack has since been renamed.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [{ artifactId: "SiteStack", regionName: "eu-west-2" }],
    });

    // When options are keyed against the name it used to have.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployCdkOut({
        directoryPath: directory.join("cdk.out"),
        stackOptions: {
          WebsiteStack: {
            bindings: [{ logicalId: "Greeter", handler: () => "never runs" }],
          },
        },
      }),
    );

    // Then the deployment says so rather than quietly losing the bindings.
    assertStringIncludes(
      error.message,
      "Options were given for WebsiteStack, which no Stack being deployed is named.",
    );
    assertStringIncludes(
      error.message,
      "The Stacks being deployed are SiteStack.",
    );
  });
});
