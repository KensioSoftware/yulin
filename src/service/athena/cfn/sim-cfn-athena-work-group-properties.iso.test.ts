import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

describe("AWS::Athena::WorkGroup properties", () => {
  async function deployed(
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimAws> {
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rainlytics-stack",
      template: {
        Resources: {
          Queries: { Type: "AWS::Athena::WorkGroup", Properties: properties },
        },
      },
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    return simAws;
  }

  async function refused(
    properties: SimCfnTemplateValueRecord,
  ): Promise<Error> {
    return await assertThrowsErrorAsync(async () => {
      await new SimAws().cloudFormation().deployTemplate({
        stackName: "rainlytics-stack",
        template: {
          Resources: {
            Queries: { Type: "AWS::Athena::WorkGroup", Properties: properties },
          },
        },
      });
    });
  }

  it("reads a quoted cutoff and a quoted flag", async () => {
    // Given a template where the numbers and booleans arrived as strings,
    // which is what a YAML template and a template parameter both produce.
    const simAws = await deployed({
      Name: "rainlytics",
      WorkGroupConfiguration: {
        BytesScannedCutoffPerQuery: "1000000",
        EnforceWorkGroupConfiguration: "true",
        RequesterPaysEnabled: "false",
      },
    });

    // When the workgroup is read back.
    const workGroup = simAws.athena().findWorkGroup("rainlytics");

    // Then the strings were read as the number and the flags they stand for.
    assertNonNullable(workGroup);
    assertIdentical(workGroup.bytesScannedCutoffPerQuery, 1_000_000);
    assertTrue(workGroup.enforcesConfiguration);
    assertFalse(workGroup.configuration.requesterPaysEnabled);
  });

  it("reads a whole result configuration", async () => {
    // Given a template setting every field Athena puts on one.
    const simAws = await deployed({
      Name: "rainlytics",
      WorkGroupConfiguration: {
        EngineVersion: { SelectedEngineVersion: "Athena engine version 3" },
        ResultConfiguration: {
          OutputLocation: "s3://results/queries/",
          ExpectedBucketOwner: "888888888888",
          EncryptionConfiguration: {
            EncryptionOption: "SSE_KMS",
            KmsKey: "arn:aws:kms:eu-west-2:888888888888:key/abc",
          },
          AclConfiguration: { S3AclOption: "BUCKET_OWNER_FULL_CONTROL" },
        },
      },
    });

    // When the workgroup is read back through GetWorkGroup.
    const read = await simAws
      .athena()
      .getWorkGroup({ input: { WorkGroup: "rainlytics" } });
    const results = read.WorkGroup?.Configuration?.ResultConfiguration;

    // Then every field comes back, including the ones nothing here acts on.
    assertNonNullable(results);
    assertIdentical(results.OutputLocation, "s3://results/queries/");
    assertIdentical(results.ExpectedBucketOwner, "888888888888");
    assertIdentical(
      results.EncryptionConfiguration?.EncryptionOption,
      "SSE_KMS",
    );
    assertIdentical(
      results.AclConfiguration?.S3AclOption,
      "BUCKET_OWNER_FULL_CONTROL",
    );
    assertIdentical(
      read.WorkGroup?.Configuration?.EngineVersion?.EffectiveEngineVersion,
      "Athena engine version 3",
    );
  });

  it("refuses a name that is not a string", async () => {
    // Given a template whose workgroup name is a number.
    // When it is deployed, then the deployment fails.
    const error = await refused({ Name: 42 });

    assertStringIncludes(error.message, "Name must be a string");
  });

  it("refuses a description that is not a string", async () => {
    // Given a template whose description is a list.
    // When it is deployed, then the deployment fails.
    const error = await refused({ Name: "rainlytics", Description: ["a"] });

    assertStringIncludes(error.message, "Description must be a string");
  });

  it("refuses a configuration that is not an object", async () => {
    // Given a template whose configuration is a string.
    // When it is deployed, then the deployment fails.
    const error = await refused({
      Name: "rainlytics",
      WorkGroupConfiguration: "enabled",
    });

    assertStringIncludes(
      error.message,
      "WorkGroupConfiguration must be an object",
    );
  });

  it("refuses a cutoff that is neither a number nor a numeric string", async () => {
    // Given a template whose cutoff is a word.
    // When it is deployed, then the deployment fails.
    const error = await refused({
      Name: "rainlytics",
      WorkGroupConfiguration: { BytesScannedCutoffPerQuery: "lots" },
    });

    assertStringIncludes(
      error.message,
      "BytesScannedCutoffPerQuery must be a number",
    );
  });

  it("refuses a flag that is neither a boolean nor true or false", async () => {
    // Given a template whose enforcement flag is a word.
    // When it is deployed, then the deployment fails.
    const error = await refused({
      Name: "rainlytics",
      WorkGroupConfiguration: { EnforceWorkGroupConfiguration: "yes" },
    });

    assertStringIncludes(
      error.message,
      "EnforceWorkGroupConfiguration must be a boolean",
    );
  });

  it("refuses an output location that is not a string", async () => {
    // Given a template whose output location is a number, which a template
    // building it from an account id gets wrong.
    // When it is deployed, then the deployment fails.
    const error = await refused({
      Name: "rainlytics",
      WorkGroupConfiguration: { ResultConfiguration: { OutputLocation: 1 } },
    });

    assertStringIncludes(error.message, "OutputLocation must be a string");
  });

  it("refuses a result configuration that is not an object", async () => {
    // Given a template whose result configuration is a string rather than the
    // object Athena takes, which is a hand-written template getting the shape
    // wrong rather than a setting this simulation has no answer for.
    // When it is deployed, then the deployment fails.
    const error = await refused({
      Name: "rainlytics",
      WorkGroupConfiguration: { ResultConfiguration: "s3://results/" },
    });

    assertStringIncludes(
      error.message,
      "ResultConfiguration must be an object",
    );
  });

  it("refuses an attribute neither Athena Resource type has", async () => {
    // Given a template reading an attribute off the workgroup that a
    // workgroup does not carry.
    // When it is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      await new SimAws().cloudFormation().deployTemplate({
        stackName: "rainlytics-stack",
        template: {
          Resources: {
            Queries: {
              Type: "AWS::Athena::WorkGroup",
              Properties: { Name: "rainlytics" },
            },
          },
          Outputs: { Arn: { Value: { "Fn::GetAtt": ["Queries", "Arn"] } } },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::Athena::WorkGroup attribute Arn",
    );
  });

  it("refuses an attribute a named query does not carry", async () => {
    // Given a template reading an ARN off a named query, which has none.
    // When it is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      await new SimAws().cloudFormation().deployTemplate({
        stackName: "rainlytics-stack",
        template: {
          Resources: {
            AdHoc: {
              Type: "AWS::Athena::NamedQuery",
              Properties: {
                Name: "adhoc",
                Database: "rainlytics",
                QueryString: "SELECT 1",
              },
            },
          },
          Outputs: { Arn: { Value: { "Fn::GetAtt": ["AdHoc", "Arn"] } } },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::Athena::NamedQuery attribute Arn",
    );
  });
});
