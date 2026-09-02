import {
  CloudFormationClient,
  CreateChangeSetCommand,
  DeleteChangeSetCommand,
  DescribeChangeSetCommand,
  ExecuteChangeSetCommand,
  ListChangeSetsCommand,
} from "@aws-sdk/client-cloudformation";
import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";

/**
 * Simulated CloudFormation change sets reached over a port by a real client.
 *
 * A deployment tool creates a change set, reads what it would do, and executes
 * it, so what these cover is whether all three survive a form-encoded request
 * and an XML envelope on the way back.
 */
describe("Serving simulated CloudFormation change sets on an endpoint URL", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let client: CloudFormationClient;

  /**
   * A template holding one Bucket, named by a parameter.
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
    });
  }

  beforeAll(async () => {
    await srv.listen();

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
      endpoint: `http://localhost:${srv.port}`,
      credentials: {
        accessKeyId: created.AccessKey.AccessKeyId,
        secretAccessKey: created.AccessKey.SecretAccessKey,
      },
    });
  });

  afterAll(async () => {
    await srv.close();
  });

  it("creates, describes and executes a change set over the endpoint", async () => {
    // Given a CREATE change set sent over the endpoint
    const created = await client.send(
      new CreateChangeSetCommand({
        StackName: "site",
        ChangeSetName: "site-create",
        ChangeSetType: "CREATE",
        Description: "The first deployment",
        TemplateBody: bucketTemplate(),
        Parameters: [
          { ParameterKey: "BucketName", ParameterValue: "served-change-set" },
        ],
      }),
    );
    assertNonNullable(created.Id, "CreateChangeSet answered with an ARN");
    assertIdentical(created.StackId, "site");

    // When it is described over the same endpoint
    const described = await client.send(
      new DescribeChangeSetCommand({
        StackName: "site",
        ChangeSetName: "site-create",
      }),
    );

    // Then the change it would make survived the XML envelope
    assertIdentical(described.Status, "CREATE_COMPLETE");
    assertIdentical(described.ExecutionStatus, "AVAILABLE");
    assertIdentical(described.Description, "The first deployment");
    assertArrayLength(described.Changes, 1);

    const resourceChange = described.Changes[0].ResourceChange;
    assertNonNullable(resourceChange, "the one Resource change");
    assertIdentical(described.Changes[0].Type, "Resource");
    assertIdentical(resourceChange.Action, "Add");
    assertIdentical(resourceChange.LogicalResourceId, "SiteBucket");
    assertIdentical(resourceChange.ResourceType, "AWS::S3::Bucket");

    // And executing it deploys the Bucket the parameter named
    await client.send(
      new ExecuteChangeSetCommand({
        StackName: "site",
        ChangeSetName: "site-create",
      }),
    );
    await simAws.cloudFormation().waitForStackDeployComplete("site");

    assertNonNullable(simAws.s3().getSimBucketByName("served-change-set"));
  });

  it("lists and deletes a change set over the endpoint", async () => {
    // Given a change set against the Stack the first test deployed
    await client.send(
      new CreateChangeSetCommand({
        StackName: "site",
        ChangeSetName: "site-rename",
        TemplateBody: bucketTemplate(),
        Parameters: [
          { ParameterKey: "BucketName", ParameterValue: "served-renamed" },
        ],
      }),
    );

    // When the Stack's change sets are listed
    const listed = await client.send(
      new ListChangeSetsCommand({ StackName: "site" }),
    );

    // Then the executed one and the pending one are both there
    assertArrayLength(listed.Summaries, 2);
    assertIdentical(listed.Summaries[1].ChangeSetName, "site-rename");
    assertIdentical(listed.Summaries[1].StackId, "site");
    assertIdentical(listed.Summaries[1].StackName, "site");
    assertIdentical(listed.Summaries[1].ExecutionStatus, "AVAILABLE");

    // And deleting them leaves the Stack holding none
    await client.send(
      new DeleteChangeSetCommand({
        StackName: "site",
        ChangeSetName: "site-rename",
      }),
    );
    await client.send(
      new DeleteChangeSetCommand({
        StackName: "site",
        ChangeSetName: "site-create",
      }),
    );

    const empty = await client.send(
      new ListChangeSetsCommand({ StackName: "site" }),
    );
    assertArrayEmpty(empty.Summaries);
  });
});
