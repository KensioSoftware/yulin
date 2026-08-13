import {
  CreateDistributionCommand,
  CreateFunctionCommand,
  CreateKeyValueStoreCommand,
} from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { assertConsistentQuantity } from "./sim-cf-list-quantity.js";
import type { SimCloudFrontDistributionConfig } from "./create-distribution/create-distribution.command.js";

const anOrigin = {
  Id: "origin1",
  DomainName: "origin-bucket.s3.amazonaws.com",
  S3OriginConfig: { OriginAccessIdentity: "" },
};

const aDefaultCacheBehavior = {
  TargetOriginId: "origin1",
  ViewerProtocolPolicy: "allow-all" as const,
};

/**
 * A DistributionConfig that is fine apart from whatever the case overrides.
 */
function distributionConfig(
  overrides: Partial<SimCloudFrontDistributionConfig>,
): SimCloudFrontDistributionConfig {
  return {
    CallerReference: "quantity-ref",
    Comment: "Quantity check",
    Enabled: true,
    Origins: { Quantity: 1, Items: [anOrigin] },
    DefaultCacheBehavior: aDefaultCacheBehavior,
    ...overrides,
  };
}

describe("A CloudFront list whose Quantity disagrees with its Items", () => {
  it("is refused on every list a Distribution carries", async () => {
    // Given a DistributionConfig with one list miscounted, a list at a time
    const miscounted: readonly [
      string,
      Partial<SimCloudFrontDistributionConfig>,
    ][] = [
      ["Origins", { Origins: { Quantity: 2, Items: [anOrigin] } }],
      ["Aliases", { Aliases: { Quantity: 1, Items: [] } }],
      [
        "CustomErrorResponses",
        {
          CustomErrorResponses: {
            Quantity: 0,
            Items: [{ ErrorCode: 404, ResponsePagePath: "/404.html" }],
          },
        },
      ],
      [
        "CacheBehaviors",
        {
          CacheBehaviors: {
            Quantity: 3,
            Items: [{ ...aDefaultCacheBehavior, PathPattern: "/api/*" }],
          },
        },
      ],
      [
        "FunctionAssociations",
        {
          DefaultCacheBehavior: {
            ...aDefaultCacheBehavior,
            FunctionAssociations: { Quantity: 1, Items: [] },
          },
        },
      ],
      [
        "AllowedMethods",
        {
          DefaultCacheBehavior: {
            ...aDefaultCacheBehavior,
            AllowedMethods: { Quantity: 5, Items: ["GET", "HEAD"] },
          },
        },
      ],
      [
        "CachedMethods",
        {
          DefaultCacheBehavior: {
            ...aDefaultCacheBehavior,
            AllowedMethods: {
              Quantity: 2,
              Items: ["GET", "HEAD"],
              CachedMethods: { Quantity: 9, Items: ["GET"] },
            },
          },
        },
      ],
    ];

    // When each is used to create a Distribution
    // Then each is refused naming the list that disagrees
    await Promise.all(
      miscounted.map(async ([listName, overrides]) => {
        const simAws = new SimAws();
        await simAws
          .s3()
          .createBucket(new CreateBucketCommand({ Bucket: "origin-bucket" }));

        const error = await assertThrowsErrorAsync(
          async () =>
            await simAws.cloudFront().createDistribution({
              input: { DistributionConfig: distributionConfig(overrides) },
            }),
        );

        assertIdentical(error.name, "InconsistentQuantities");
        assertStringIncludes(error.message, listName);
      }),
    );
  });

  it("is refused on a Function's key value store associations", async () => {
    // Given a store, and a Function miscounting its one association
    const simAws = new SimAws();
    const created = await simAws
      .cloudFront()
      .keyValueStores()
      .createKeyValueStore(
        new CreateKeyValueStoreCommand({ Name: "redirects" }),
      );

    // When the Function is created
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.cloudFront().createFunction(
          new CreateFunctionCommand({
            Name: "miscounted",
            FunctionConfig: {
              Comment: "Miscounts its association",
              Runtime: "cloudfront-js-2.0",
              KeyValueStoreAssociations: {
                Quantity: 0,
                Items: [{ KeyValueStoreARN: created.KeyValueStore.ARN }],
              },
            },
            FunctionCode: Buffer.from(
              "function handler(event) { return event.request; }",
            ),
          }),
        ),
    );

    // Then it is refused, rather than creating a Function with no store
    assertIdentical(error.name, "InconsistentQuantities");
  });

  it("accepts a Distribution whose counts are right", async () => {
    // Given a DistributionConfig counting every list correctly
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "origin-bucket" }));

    // When the Distribution is created through the real SDK command, so the
    // counted lists are checked against the AWS types as well
    const created = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "quantity-ref",
          Comment: "Quantity check",
          Enabled: true,
          Origins: { Quantity: 1, Items: [anOrigin] },
          DefaultCacheBehavior: aDefaultCacheBehavior,
          Aliases: { Quantity: 1, Items: ["cdn.test"] },
          CustomErrorResponses: {
            Quantity: 1,
            Items: [
              {
                ErrorCode: 404,
                ResponsePagePath: "/404.html",
                ResponseCode: "404",
              },
            ],
          },
        },
      }),
    );

    // Then it is created
    assertTrue(created.Distribution?.DistributionConfig?.Enabled);
  });
});

describe("The Quantity check itself", () => {
  it("has nothing to check on a plain array", () => {
    // Given the CloudFormation shape, which is an array with no count
    // When it is checked
    // Then nothing is refused, because there is no Quantity to disagree
    assertConsistentQuantity("Origins", [anOrigin]);
  });

  it("has nothing to check without a Quantity", () => {
    // Given a hand-written list with only Items
    // When it is checked
    // Then it is accepted: the AWS SDK types make omitting Quantity a compile
    // error, so what arrives without one is not the mistake this catches
    assertConsistentQuantity("Origins", { Items: [anOrigin] });
  });

  it("counts a missing Items as none", () => {
    // Given a list claiming items it does not carry at all
    // When it is checked
    const error = assertThrowsError(() => {
      assertConsistentQuantity("Origins", { Quantity: 1 });
    });

    // Then it is refused
    assertIdentical(error.name, "InconsistentQuantities");
  });

  it("has nothing to check on a value that is not a list", () => {
    // Given something that is not a list at all
    // When it is checked
    // Then nothing is refused: whatever reads it will report it in its own
    // terms, and this is not the place to learn a second shape
    assertConsistentQuantity("Origins", "not a list");
    assertConsistentQuantity("Origins", undefined);
    assertConsistentQuantity("Origins", { Quantity: "two", Items: [] });
  });
});
