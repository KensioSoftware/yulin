import { describe, it } from "vitest";
import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimSdk } from "../../../sdk/index.js";

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
    assertIdentical(stackCreation.StackId, "intercepted-stack");

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

  it("rejects a Command simulated CloudFormation does not support", async () => {
    using simSdk = new SimSdk();
    const client = new CloudFormationClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    const error = await assertThrowsErrorAsync(async () => {
      await client.send(new DeleteStackCommand({ StackName: "some-stack" }));
    });

    assertStringIncludes(error.message, "DeleteStackCommand");
    assertStringIncludes(error.message, "CreateStackCommand");
  });
});
