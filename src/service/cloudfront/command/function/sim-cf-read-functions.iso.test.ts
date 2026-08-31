import {
  CreateFunctionCommand,
  DescribeFunctionCommand,
  GetFunctionCommand,
  ListFunctionsCommand,
} from "@aws-sdk/client-cloudfront";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";
import { SimCloudFrontInvalidArgument } from "../../error/sim-cloudfront.error.js";
import { SimCloudFrontNoSuchFunctionExists } from "../../error/sim-cloudfront.error.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";

const beaconCode = `
  function handler(event) {
    return { statusCode: 204, statusDescription: "No Content" };
  }
`;

/**
 * A simulation holding one published Function, the way a deploy leaves one.
 */
async function givenPublishedFunction(name: string): Promise<{
  readonly simAws: SimAws;
  readonly simCloudFront: SimCloudFront;
}> {
  const simAws = new SimAws();
  const simCloudFront = simAws.cloudFront();

  await simCloudFront.createFunction(
    new CreateFunctionCommand({
      Name: name,
      FunctionConfig: {
        Comment: "Answers the analytics beacon",
        Runtime: "cloudfront-js-2.0",
      },
      FunctionCode: Buffer.from(beaconCode),
    }),
  );
  await simAws.backgroundTasksComplete();

  return { simAws, simCloudFront };
}

describe("CloudFront ListFunctionsCommand", () => {
  it("lists a Function with the config it was created with", async () => {
    // Given a published CloudFront Function.
    const { simCloudFront } = await givenPublishedFunction("beacon-cff");

    // When the Account's Functions are listed.
    const listed = await simCloudFront.listFunctions(
      new ListFunctionsCommand({}),
    );

    // Then the Function comes back carrying its comment and its runtime.
    assertIdentical(listed.FunctionList.Quantity, 1);
    assertArrayLength(listed.FunctionList.Items, 1);
    const summary = listed.FunctionList.Items[0];
    assertNonNullable(summary);
    assertIdentical(summary.Name, "beacon-cff");
    assertIdentical(summary.Status, "UNASSOCIATED");
    assertIdentical(summary.FunctionConfig.Runtime, "cloudfront-js-2.0");
    assertIdentical(
      summary.FunctionConfig.Comment,
      "Answers the analytics beacon",
    );
    assertIdentical(summary.FunctionMetadata.Stage, "DEVELOPMENT");
    assertStringIncludes(
      summary.FunctionMetadata.FunctionARN,
      ":function/beacon-cff",
    );
  });

  it("lists a Function a template deployed", async () => {
    // Given a stack that declares a CloudFront Function.
    const simAws = new SimAws();
    await simAws.cloudFormation().deployTemplate({
      template: {
        Resources: {
          BeaconFunction: {
            Type: "AWS::CloudFront::Function",
            Properties: {
              Name: "template-beacon-cff",
              FunctionConfig: {
                Comment: "Deployed from a template",
                Runtime: "cloudfront-js-2.0",
              },
              FunctionCode: beaconCode,
            },
          },
        },
      },
    });
    await simAws.backgroundTasksComplete();

    // When the Account's Functions are listed.
    const listed = await simAws
      .cloudFront()
      .listFunctions(new ListFunctionsCommand({}));

    // Then the template's Function reports the config the template gave it.
    const summary = listed.FunctionList.Items[0];
    assertNonNullable(summary);
    assertIdentical(summary.Name, "template-beacon-cff");
    assertIdentical(summary.FunctionConfig.Comment, "Deployed from a template");
    assertIdentical(summary.FunctionConfig.Runtime, "cloudfront-js-2.0");
  });

  it("reports the key value store a Function is associated with", async () => {
    // Given a Function reading a key value store.
    const simAws = new SimAws();
    const simCloudFront = simAws.cloudFront();
    const storeCreation = await simCloudFront
      .keyValueStores()
      .createKeyValueStore({ input: { Name: "redirects" } });
    await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: "redirecting-cff",
        FunctionConfig: {
          Comment: "Reads the redirect table",
          Runtime: "cloudfront-js-2.0",
          KeyValueStoreAssociations: {
            Quantity: 1,
            Items: [{ KeyValueStoreARN: storeCreation.KeyValueStore.ARN }],
          },
        },
        FunctionCode: Buffer.from(beaconCode),
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the Functions are listed.
    const listed = await simCloudFront.listFunctions(
      new ListFunctionsCommand({}),
    );

    // Then the association comes back with the store's ARN.
    const associations =
      listed.FunctionList.Items[0]?.FunctionConfig.KeyValueStoreAssociations;
    assertNonNullable(associations);
    assertIdentical(associations.Quantity, 1);
    assertIdentical(
      associations.Items[0]?.KeyValueStoreARN,
      storeCreation.KeyValueStore.ARN,
    );
  });

  it("leaves an unpublished Function out of the LIVE stage", async () => {
    // Given a Function that has been created and not yet published.
    const simAws = new SimAws();
    const simCloudFront = simAws.cloudFront();
    await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: "unpublished-cff",
        FunctionConfig: { Comment: "", Runtime: "cloudfront-js-2.0" },
        FunctionCode: Buffer.from(beaconCode),
      }),
    );

    // When each stage is listed.
    const development = await simCloudFront.listFunctions(
      new ListFunctionsCommand({ Stage: "DEVELOPMENT" }),
    );
    const live = await simCloudFront.listFunctions(
      new ListFunctionsCommand({ Stage: "LIVE" }),
    );

    // Then it is in DEVELOPMENT alone until CloudFront publishes it.
    assertIdentical(development.FunctionList.Quantity, 1);
    assertIdentical(live.FunctionList.Quantity, 0);

    await simAws.backgroundTasksComplete();
    const published = await simCloudFront.listFunctions(
      new ListFunctionsCommand({ Stage: "LIVE" }),
    );
    assertIdentical(published.FunctionList.Quantity, 1);
    assertIdentical(
      published.FunctionList.Items[0]?.FunctionMetadata.Stage,
      "LIVE",
    );
  });

  it("lists nothing for an Account holding no Function", async () => {
    // Given a simulated CloudFront with no Functions.
    const simCloudFront = new SimAws().cloudFront();

    // When the Functions are listed.
    const listed = await simCloudFront.listFunctions(
      new ListFunctionsCommand({}),
    );

    // Then the list is empty rather than missing.
    assertIdentical(listed.FunctionList.Quantity, 0);
    assertArrayEmpty(listed.FunctionList.Items);
  });

  it("refuses a stage that names neither DEVELOPMENT nor LIVE", async () => {
    // Given a published CloudFront Function.
    const { simCloudFront } = await givenPublishedFunction("beacon-cff");

    // When a listing asks for a stage CloudFront does not have.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.listFunctions(
        new ListFunctionsCommand({ Stage: "STAGING" as "LIVE" }),
      ),
    );

    // Then it is refused rather than answered with everything.
    assertInstanceOf(error, SimCloudFrontInvalidArgument);
    assertStringIncludes(error.message, "STAGING");
  });
});

describe("CloudFront DescribeFunctionCommand", () => {
  it("describes one Function by name", async () => {
    // Given a published CloudFront Function.
    const { simCloudFront } = await givenPublishedFunction("beacon-cff");

    // When it is described by name.
    const described = await simCloudFront.describeFunction(
      new DescribeFunctionCommand({ Name: "beacon-cff" }),
    );

    // Then its config and its metadata come back, with the Function's ETag.
    assertIdentical(described.FunctionSummary.Name, "beacon-cff");
    assertIdentical(
      described.FunctionSummary.FunctionConfig.Runtime,
      "cloudfront-js-2.0",
    );
    assertUndefined(
      described.FunctionSummary.FunctionConfig.KeyValueStoreAssociations,
    );
    assertStringIncludes(described.ETag, "E");
    assertIdentical(
      described.FunctionSummary.FunctionMetadata.CreatedTime.getTime(),
      described.FunctionSummary.FunctionMetadata.LastModifiedTime.getTime(),
    );
  });

  it("answers a name no Function holds with NoSuchFunctionExists", async () => {
    // Given a simulated CloudFront without the requested Function.
    const simCloudFront = new SimAws().cloudFront();

    // When a missing Function is described.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.describeFunction(
        new DescribeFunctionCommand({ Name: "no-such-cff" }),
      ),
    );

    // Then CloudFront answers with its missing-Function error.
    assertInstanceOf(error, SimCloudFrontNoSuchFunctionExists);
    assertIdentical(error.$metadata.httpStatusCode, 404);
  });

  it("answers an unpublished Function in LIVE with NoSuchFunctionExists", async () => {
    // Given a Function that has been created and not yet published.
    const simCloudFront = new SimAws().cloudFront();
    await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: "unpublished-cff",
        FunctionConfig: { Comment: "", Runtime: "cloudfront-js-2.0" },
        FunctionCode: Buffer.from(beaconCode),
      }),
    );

    // When the LIVE copy is described.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.describeFunction(
        new DescribeFunctionCommand({
          Name: "unpublished-cff",
          Stage: "LIVE",
        }),
      ),
    );

    // Then there is no LIVE copy to describe yet.
    assertInstanceOf(error, SimCloudFrontNoSuchFunctionExists);
  });

  it("requires a Function name", async () => {
    // Given a simulated CloudFront.
    const simCloudFront = new SimAws().cloudFront();

    // When a description arrives without a name.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.describeFunction(
        new DescribeFunctionCommand({ Name: undefined }),
      ),
    );

    // Then it is refused before anything is read.
    assertInstanceOf(error, Error);
  });
});

describe("CloudFront GetFunctionCommand", () => {
  it("gets the code a Function was created with", async () => {
    // Given a published CloudFront Function.
    const { simCloudFront } = await givenPublishedFunction("beacon-cff");

    // When its code is read back.
    const got = await simCloudFront.getFunction(
      new GetFunctionCommand({ Name: "beacon-cff" }),
    );

    // Then the source it was created with comes back.
    assertIdentical(Buffer.from(got.FunctionCode).toString(), beaconCode);
    assertIdentical(got.ContentType, "application/octet-stream");
  });

  it("gets the source of a Function bound to a handler", async () => {
    // Given a Function a template bound to a handler function.
    const simAws = new SimAws();
    await simAws.cloudFormation().deployTemplate({
      template: {
        Resources: {
          BoundFunction: {
            Type: "AWS::CloudFront::Function",
            Properties: {
              Name: "bound-cff",
              FunctionCode: "function handler(event) { return event.request; }",
            },
          },
        },
      },
      bindings: [
        {
          logicalId: "BoundFunction",
          handler: (event: CloudFrontFunction.ViewerRequestEvent) =>
            event.request,
        },
      ],
    });
    await simAws.backgroundTasksComplete();

    // When its code is read back.
    const got = await simAws
      .cloudFront()
      .getFunction(new GetFunctionCommand({ Name: "bound-cff" }));

    // Then the handler's own source stands in for code never uploaded.
    assertStringIncludes(
      Buffer.from(got.FunctionCode).toString(),
      "event.request",
    );
  });

  it("answers a name no Function holds with NoSuchFunctionExists", async () => {
    // Given a simulated CloudFront without the requested Function.
    const simCloudFront = new SimAws().cloudFront();

    // When a missing Function's code is read.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.getFunction(new GetFunctionCommand({ Name: "no-such" })),
    );

    // Then CloudFront answers with its missing-Function error.
    assertInstanceOf(error, SimCloudFrontNoSuchFunctionExists);
  });

  it("requires a Function name", async () => {
    // Given a simulated CloudFront.
    const simCloudFront = new SimAws().cloudFront();

    // When a read arrives without a name.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.getFunction(new GetFunctionCommand({ Name: undefined })),
    );

    // Then it is refused before anything is read.
    assertInstanceOf(error, Error);
  });
});
