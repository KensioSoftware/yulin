import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  ListStacksCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";

/**
 * Simulated CloudFormation reached over a port by a real client.
 *
 * CloudFormation speaks the Query protocol, so what these cover is whether a
 * template, its parameters and the Stack description survive a form-encoded
 * request and an XML envelope on the way back.
 */
describe("Serving simulated CloudFormation on an endpoint URL", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let endpoint: string;
  let client: CloudFormationClient;

  /**
   * A template holding one Bucket, named by a parameter and reported as an
   * Output, which is the smallest template that exercises both directions.
   */
  function bucketTemplate(): string {
    return JSON.stringify({
      Parameters: { BucketName: { Type: "String" } },
      Resources: {
        SiteBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: { Ref: "BucketName" } },
        },
      },
      Outputs: {
        SiteBucketName: {
          Value: { Ref: "SiteBucket" },
          Description: "The Bucket the site is served from",
        },
      },
    });
  }

  beforeAll(async () => {
    await srv.listen();
    endpoint = `http://localhost:${srv.port}`;

    const simIam = simAws.iam();
    await simIam.createUser(new CreateUserCommand({ UserName: "Deployer" }));
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Deployer",
        PolicyName: "Everything",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: { Effect: "Allow", Action: "*", Resource: "*" },
        }),
      }),
    );
    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "Deployer" }),
    );

    client = new CloudFormationClient({
      region: simAws.defaultRegionName,
      endpoint,
      credentials: {
        accessKeyId: created.AccessKey.AccessKeyId,
        secretAccessKey: created.AccessKey.SecretAccessKey,
      },
    });
  });

  afterAll(async () => {
    await srv.close();
  });

  it("deploys a Stack from a template sent over the endpoint", async () => {
    // Given a template and the parameter naming the Bucket it creates
    const created = await client.send(
      new CreateStackCommand({
        StackName: "site",
        TemplateBody: bucketTemplate(),
        Parameters: [
          { ParameterKey: "BucketName", ParameterValue: "served-site" },
        ],
      }),
    );
    assertIdentical(created.StackId, "site");

    // When the deployment the call started has finished
    await simAws.cloudFormation().waitForStackDeployComplete("site");

    // Then the Stack describes itself over the same endpoint, Outputs and all
    const described = await client.send(
      new DescribeStacksCommand({ StackName: "site" }),
    );
    const [stack] = described.Stacks ?? [];
    assertNonNullable(stack, "DescribeStacks answered with a Stack");
    assertIdentical(stack.StackName, "site");
    assertIdentical(stack.StackStatus, "CREATE_COMPLETE");
    const [stackOutput] = stack.Outputs ?? [];
    assertNonNullable(stackOutput, "the Stack's one Output");
    assertIdentical(stackOutput.OutputKey, "SiteBucketName");
    assertIdentical(stackOutput.OutputValue, "served-site");
    assertIdentical(
      stackOutput.Description,
      "The Bucket the site is served from",
    );

    // And the parameter reached simulated S3, which made the Bucket
    assertNonNullable(simAws.s3().getSimBucketByName("served-site"));
  });

  it("changes a deployed Stack and removes it again", async () => {
    // Given a deployed Stack
    await client.send(
      new CreateStackCommand({
        StackName: "reports",
        TemplateBody: bucketTemplate(),
        Parameters: [
          { ParameterKey: "BucketName", ParameterValue: "served-reports" },
        ],
      }),
    );
    await simAws.cloudFormation().waitForStackDeployComplete("reports");

    // When the same template is deployed again under another parameter
    const updated = await client.send(
      new UpdateStackCommand({
        StackName: "reports",
        TemplateBody: bucketTemplate(),
        Parameters: [
          { ParameterKey: "BucketName", ParameterValue: "served-archive" },
        ],
      }),
    );
    assertIdentical(updated.StackId, "reports");
    await simAws.cloudFormation().waitForStackUpdateComplete("reports");

    // Then the Stack reports the update and the Bucket it now holds
    const described = await client.send(
      new DescribeStacksCommand({ StackName: "reports" }),
    );
    const [stack] = described.Stacks ?? [];
    assertNonNullable(stack, "DescribeStacks answered with a Stack");
    assertIdentical(stack.StackStatus, "UPDATE_COMPLETE");
    const [changedOutput] = stack.Outputs ?? [];
    assertNonNullable(changedOutput, "the Stack's one Output");
    assertIdentical(changedOutput.OutputValue, "served-archive");

    // And removing it over the endpoint leaves nothing to describe
    await client.send(new DeleteStackCommand({ StackName: "reports" }));
    await simAws.backgroundTasksComplete();

    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(new DescribeStacksCommand({ StackName: "reports" })),
    );
    assertStringIncludes(error.message, "reports");
  });

  it("describes every Stack when the request names none", async () => {
    // When the whole environment is described, as `aws cloudformation
    // describe-stacks` does with no arguments
    const described = await client.send(new DescribeStacksCommand({}));

    // Then the listing carries the Stacks left standing
    const stacks = described.Stacks ?? [];
    assertArrayLength(stacks, 1);

    const [only] = stacks;
    assertNonNullable(only, "the one Stack left standing");
    assertIdentical(only.StackName, "site");
  });

  it("refuses a CloudFormation operation it does not serve", async () => {
    // When an operation simulated CloudFormation has no answer for is asked for
    const error = await assertThrowsErrorAsync(
      async () => await client.send(new ListStacksCommand({})),
    );

    // Then it is refused by name, in the shape the Query protocol states an
    // error, so the SDK raises it rather than failing to parse the response
    assertIdentical(error.name, "NotImplemented");
    assertStringIncludes(error.message, "ListStacks");
  });
});
