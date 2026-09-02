import { describe, it } from "vitest";
import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  ListStacksCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { SimSdk } from "../../../sdk/index.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";

describe("simulated CloudFormation SDK Command routing", () => {
  it("deploys a Stack with resources through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new CloudFormationClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    const stackCreation = await client.send(
      new CreateStackCommand({
        StackName: "intercepted-stack",
        TemplateBody: JSON.stringify({
          Resources: {
            FooBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "cfn-intercepted-bucket" },
            },
          },
        }),
      }),
    );
    assertStringIncludes(stackCreation.StackId, ":stack/intercepted-stack/");

    // Stack creation returns before resources finish deploying.
    await simSdk.simAws
      .region("eu-west-2")
      .cloudFormation()
      .waitForStackDeployComplete("intercepted-stack");

    const describeOut = await client.send(
      new DescribeStacksCommand({ StackName: "intercepted-stack" }),
    );
    assertIdentical(describeOut.Stacks?.[0]?.StackStatus, "CREATE_COMPLETE");

    // And simulated CloudFormation created the Bucket in simulated S3, in
    // the scope resolved from the intercepted client's Region.
    assertNonNullable(
      simSdk.simAws
        .region("eu-west-2")
        .s3()
        .getSimBucketByName("cfn-intercepted-bucket"),
    );
  });

  it("does not give a denied run-as caller root privileges", async () => {
    using simSdk = new SimSdk();
    const accountId = simSdk.simAws.defaultAccountId;
    const client = new CloudFormationClient({ region: "us-east-1" });
    simSdk.intercept(client);

    const error = await assertThrowsErrorAsync(async () => {
      await simSdk.simAws.runAs(
        { kind: "arn", arn: `arn:aws:iam::${accountId}:role/NoPermsRole` },
        async () => {
          await client.send(
            new CreateStackCommand({
              StackName: "denied-stack",
              TemplateBody: JSON.stringify({ Resources: {} }),
            }),
          );
        },
      );
    });

    assertInstanceOf(error, SimIamAccessDenied);
    assertUndefined(
      simSdk.simAws.cloudFormation().getStackByName("denied-stack"),
    );
  });

  it("deletes a Stack and its resources through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new CloudFormationClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    await client.send(
      new CreateStackCommand({
        StackName: "disposable-stack",
        TemplateBody: JSON.stringify({
          Resources: {
            FooBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "cfn-disposable-bucket" },
            },
          },
        }),
      }),
    );

    const cloudFormation = simSdk.simAws.region("eu-west-2").cloudFormation();
    await cloudFormation.waitForStackDeployComplete("disposable-stack");

    // When the Stack is deleted through the same intercepted client.
    await client.send(
      new DeleteStackCommand({ StackName: "disposable-stack" }),
    );
    await cloudFormation.waitForStackDeleteComplete("disposable-stack");

    // Then the Bucket has gone from simulated S3, and the Stack name with it.
    assertUndefined(
      simSdk.simAws
        .region("eu-west-2")
        .s3()
        .getSimBucketByName("cfn-disposable-bucket"),
    );
    assertUndefined(cloudFormation.getStackByName("disposable-stack"));
  });

  it("updates a Stack through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new CloudFormationClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    await client.send(
      new CreateStackCommand({
        StackName: "updatable-stack",
        TemplateBody: JSON.stringify({
          Resources: {
            FooBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "cfn-updatable-bucket" },
            },
          },
        }),
      }),
    );

    const cloudFormation = simSdk.simAws.region("eu-west-2").cloudFormation();
    await cloudFormation.waitForStackDeployComplete("updatable-stack");

    // When a changed template is sent through the same intercepted client.
    const stackUpdate = await client.send(
      new UpdateStackCommand({
        StackName: "updatable-stack",
        TemplateBody: JSON.stringify({
          Resources: {
            FooBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "cfn-updatable-bucket" },
            },
            BarBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "cfn-added-bucket" },
            },
          },
        }),
      }),
    );
    assertStringIncludes(stackUpdate.StackId, ":stack/updatable-stack/");

    await cloudFormation.waitForStackUpdateComplete("updatable-stack");

    // Then the added Bucket is in simulated S3, in the scope resolved from the
    // intercepted client's Region.
    assertNonNullable(
      simSdk.simAws
        .region("eu-west-2")
        .s3()
        .getSimBucketByName("cfn-added-bucket"),
    );
  });

  it("rejects a Command simulated CloudFormation does not support", async () => {
    using simSdk = new SimSdk();
    const client = new CloudFormationClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    const error = await assertThrowsErrorAsync(async () => {
      await client.send(new ListStacksCommand({}));
    });

    assertStringIncludes(error.message, "ListStacksCommand");
    assertStringIncludes(error.message, "CreateStackCommand");
  });
});
