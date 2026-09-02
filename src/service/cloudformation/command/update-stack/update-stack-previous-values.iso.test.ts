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
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import { SimAws } from "../../../aws/sim-aws.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";
import { SimCloudFormationValidationError } from "../../error/sim-cloudformation.error.js";

describe("CloudFormation UpdateStackCommand previous template and values", () => {
  /**
   * A Stack whose only Bucket is named from two Parameters, so an update can
   * move one of them and leave the other where the deployment put it.
   */
  const reportsTemplate = jsonStringify({
    Parameters: {
      Environment: { Type: "String", Default: "dev" },
      Version: { Type: "String", Default: "one" },
    },
    Resources: {
      ReportsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          // oxlint-disable-next-line no-template-curly-in-string -- Fn::Sub syntax, not a JavaScript template.
          BucketName: { "Fn::Sub": "reports-${Environment}-${Version}" },
        },
      },
    },
    Outputs: { BucketName: { Value: { Ref: "ReportsBucket" } } },
  });

  async function deployReportsStack(
    simAws: SimAws,
    parameters?: readonly { ParameterKey: string; ParameterValue: string }[],
  ): Promise<void> {
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "reports-stack",
        TemplateBody: reportsTemplate,
        Parameters: parameters === undefined ? undefined : [...parameters],
      }),
    );
    await cloudFormation.waitForStackDeployComplete("reports-stack");
  }

  it("updates from the template the Stack already holds", async () => {
    // Given a Stack deployed with a Parameter value the caller wants to move,
    // and no copy of the template to hand.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws, [
      { ParameterKey: "Environment", ParameterValue: "staging" },
      { ParameterKey: "Version", ParameterValue: "one" },
    ]);

    // When the update asks for the template the Stack is deployed from and
    // supplies the new Parameter values only.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        UsePreviousTemplate: true,
        Parameters: [
          { ParameterKey: "Environment", ParameterValue: "staging" },
          { ParameterKey: "Version", ParameterValue: "two" },
        ],
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("reports-stack");

    // Then the Bucket the held template describes is created under the new
    // value, and the Output resolves against it.
    assertNonNullable(simAws.s3().getSimBucketByName("reports-staging-two"));
    assertUndefined(simAws.s3().getSimBucketByName("reports-staging-one"));
    assertIdentical(
      cloudFormation.getStackByName("reports-stack")?.output("BucketName"),
      "reports-staging-two",
    );
  });

  it("refuses UsePreviousTemplate alongside a TemplateBody", async () => {
    // Given a deployed Stack.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);

    // When an update says where its template comes from twice.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.updateStack(
        new UpdateStackCommand({
          StackName: "reports-stack",
          TemplateBody: reportsTemplate,
          UsePreviousTemplate: true,
        }),
      ),
    );

    // Then it is refused, as CloudFormation refuses it, rather than one of the
    // two being picked.
    assertInstanceOf(error, SimCloudFormationValidationError);
    assertIdentical(
      error.message,
      "You cannot specify both TemplateBody and UsePreviousTemplate",
    );
    assertIdentical(
      cloudFormation.getStackByName("reports-stack")?.status,
      "CREATE_COMPLETE",
    );
  });

  it("takes the deployed value for a Parameter carrying UsePreviousValue", async () => {
    // Given a Stack deployed with two Parameter values, one of which the
    // caller has no reason to write out again.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws, [
      { ParameterKey: "Environment", ParameterValue: "staging" },
      { ParameterKey: "Version", ParameterValue: "one" },
    ]);

    // When the update carries UsePreviousValue for that one.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        UsePreviousTemplate: true,
        Parameters: [
          { ParameterKey: "Environment", UsePreviousValue: true },
          { ParameterKey: "Version", ParameterValue: "two" },
        ],
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("reports-stack");

    // Then the Stack is updated with the value it was deployed with.
    assertNonNullable(simAws.s3().getSimBucketByName("reports-staging-two"));
  });

  it("takes the template Default for a Parameter the Stack was deployed without", async () => {
    // Given a Stack deployed with no Parameters at all, so both took their
    // template Default.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);

    // When an update asks for the previous value of one of them.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        UsePreviousTemplate: true,
        Parameters: [
          { ParameterKey: "Environment", UsePreviousValue: true },
          { ParameterKey: "Version", ParameterValue: "two" },
        ],
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("reports-stack");

    // Then it resolves to the Default the deployment resolved it to.
    assertNonNullable(simAws.s3().getSimBucketByName("reports-dev-two"));
  });

  it("takes the deployed value for an empty value alongside UsePreviousValue", async () => {
    // Given a Stack deployed with a Parameter value, and an SDK that writes an
    // empty ParameterValue for a Parameter carrying nothing but the flag.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws, [
      { ParameterKey: "Environment", ParameterValue: "staging" },
      { ParameterKey: "Version", ParameterValue: "one" },
    ]);

    // When the update carries both.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        UsePreviousTemplate: true,
        Parameters: [
          {
            ParameterKey: "Environment",
            ParameterValue: "",
            UsePreviousValue: true,
          },
          { ParameterKey: "Version", ParameterValue: "two" },
        ],
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("reports-stack");

    // Then the empty value counts as none, and the deployed one is taken.
    assertNonNullable(simAws.s3().getSimBucketByName("reports-staging-two"));
  });

  it("refuses a Parameter carrying UsePreviousValue and a value", async () => {
    // Given a deployed Stack.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);

    // When an update says two things about one Parameter value.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.updateStack(
        new UpdateStackCommand({
          StackName: "reports-stack",
          UsePreviousTemplate: true,
          Parameters: [
            {
              ParameterKey: "Version",
              ParameterValue: "two",
              UsePreviousValue: true,
            },
          ],
        }),
      ),
    );

    // Then it is refused, naming the Parameter it could not read.
    assertInstanceOf(error, SimCloudFormationValidationError);
    assertIdentical(
      error.message,
      "Invalid input for parameter key Version. Cannot specify usePreviousValue as true and non empty value for a parameter.",
    );
  });

  it("refuses an update from the held template that changes nothing", async () => {
    // Given a Stack deployed with a Parameter value.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws, [
      { ParameterKey: "Version", ParameterValue: "one" },
    ]);

    // When an update asks for the held template and the deployed values.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.updateStack(
        new UpdateStackCommand({
          StackName: "reports-stack",
          UsePreviousTemplate: true,
          Parameters: [{ ParameterKey: "Version", UsePreviousValue: true }],
        }),
      ),
    );

    // Then it is refused the way any other update with nothing to do is.
    assertIdentical(error.message, "No updates are to be performed.");
  });
});
