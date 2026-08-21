import { describe, it } from "vitest";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import {
  CreateStackCommand,
  DeleteStackCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import { SimAws } from "../../../aws/sim-aws.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";
import { SimCloudFormationValidationError } from "../../error/sim-cloudformation.error.js";
import { deployedStackObject } from "../sim-cfn-stack.fixture.js";

const parameterisedTemplate = {
  Parameters: { BucketSuffix: { Type: "String", Default: "one" } },
  Resources: {
    ReportsBucket: {
      Type: "AWS::S3::Bucket",
      Properties: {
        // oxlint-disable-next-line no-template-curly-in-string -- Fn::Sub syntax, not a JavaScript template.
        BucketName: { "Fn::Sub": "reports-${BucketSuffix}" },
      },
    },
    ArchiveBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "archive" },
    },
  },
};

describe("simulated CloudFormation Stack update", () => {
  it("leaves a Resource the new template does not change alone", async () => {
    // Given a deployed Stack of two Buckets.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify(parameterisedTemplate),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("reports-stack");

    const stack = cloudFormation.getStackByName("reports-stack");
    assertNonNullable(stack);
    const archiveResource = stack.getResource("ArchiveBucket");

    // When an update replaces the other Bucket.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify(parameterisedTemplate),
        Parameters: [{ ParameterKey: "BucketSuffix", ParameterValue: "two" }],
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("reports-stack");

    // Then the Resource the template left alone is the same one the deployment
    // created, rather than a Resource created again from the same template.
    assertIdentical(stack.getResource("ArchiveBucket"), archiveResource);
    assertIdentical(archiveResource?.status, "CREATE_COMPLETE");
    assertNonNullable(simAws.s3().getSimBucketByName("archive"));
  });

  it("reads a changed Parameter value as a changed Resource", async () => {
    // Given a Stack deployed with a Parameter default in a Bucket name.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify(parameterisedTemplate),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("reports-stack");

    assertNonNullable(simAws.s3().getSimBucketByName("reports-one"));

    // When the same template is updated with a different Parameter value.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify(parameterisedTemplate),
        Parameters: [{ ParameterKey: "BucketSuffix", ParameterValue: "two" }],
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("reports-stack");

    // Then the Bucket the Parameter named was replaced, because Resources are
    // compared as they resolve rather than as they are written.
    assertNonNullable(simAws.s3().getSimBucketByName("reports-two"));
    assertUndefined(simAws.s3().getSimBucketByName("reports-one"));
  });

  it("does not read a reordered template as a change", async () => {
    // Given a deployed Stack.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify({
          Resources: {
            ReportsBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "reports", AccessControl: "Private" },
            },
          },
        }),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("reports-stack");

    // When the same template is sent with its keys in another order.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.updateStack(
        new UpdateStackCommand({
          StackName: "reports-stack",
          TemplateBody: jsonStringify({
            Resources: {
              ReportsBucket: {
                Properties: { AccessControl: "Private", BucketName: "reports" },
                Type: "AWS::S3::Bucket",
              },
            },
          }),
        }),
      ),
    );

    // Then it is an update with nothing to do, because CloudFormation reads
    // nothing into the order a template is written in.
    assertInstanceOf(error, SimCloudFormationValidationError);
    assertIdentical(error.message, "No updates are to be performed.");
  });

  it("updates a Stack whose template only changes a Description", async () => {
    // Given a deployed Stack.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify(parameterisedTemplate),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("reports-stack");

    // When a template that only adds a Description is applied.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify({
          ...parameterisedTemplate,
          Description: "Where the reports go",
        }),
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("reports-stack");

    // Then the Stack updated rather than refusing an update with nothing to
    // do, because a section this simulation does not act on is still part of
    // the template. Its Buckets were left alone.
    const stack = cloudFormation.getStackByName("reports-stack");
    assertNonNullable(stack);

    assertIdentical(stack.status, "UPDATE_COMPLETE");
    assertIdentical(
      deployedStackObject(stack).template["Description"],
      "Where the reports go",
    );
    assertNonNullable(simAws.s3().getSimBucketByName("reports-one"));
  });

  it("reads a changed Parameter value in an Output as a change", async () => {
    // Given a Stack whose Parameter reaches an Output and no Resource.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();
    const templateBody = jsonStringify({
      Parameters: { SiteUrl: { Type: "String", Default: "https://one.test" } },
      Resources: {
        ArchiveBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "archive" },
        },
      },
      Outputs: { SiteUrl: { Value: { Ref: "SiteUrl" } } },
    });

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "site-stack",
        TemplateBody: templateBody,
      }),
    );
    await cloudFormation.waitForStackDeployComplete("site-stack");

    // When the same template is updated with a different value for it.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "site-stack",
        TemplateBody: templateBody,
        Parameters: [
          { ParameterKey: "SiteUrl", ParameterValue: "https://two.test" },
        ],
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("site-stack");

    // Then the update ran, because Outputs are compared as they resolve as
    // well, and the Output reads as the new value.
    const stack = cloudFormation.getStackByName("site-stack");
    assertNonNullable(stack);

    assertIdentical(stack.status, "UPDATE_COMPLETE");
    assertIdentical(stack.outputs.get("SiteUrl")?.value, "https://two.test");
  });

  it("deletes a Stack an update changed", async () => {
    // Given a Stack an update added a Bucket to.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify({
          Resources: {
            ReportsBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "reports" },
            },
          },
        }),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("reports-stack");

    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify(parameterisedTemplate),
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("reports-stack");

    // When the Stack is deleted.
    await cloudFormation.deleteStack(
      new DeleteStackCommand({ StackName: "reports-stack" }),
    );
    await cloudFormation.waitForStackDeleteComplete("reports-stack");

    // Then the teardown deleted the Resources the Stack holds now, including
    // the one the update added.
    assertUndefined(simAws.s3().getSimBucketByName("reports-one"));
    assertUndefined(simAws.s3().getSimBucketByName("archive"));
    assertUndefined(cloudFormation.getStackByName("reports-stack"));
  });
});
