import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimCloudFormationResourceCreateContext } from "../../cloudformation/resource/sim-cfn-resource.js";
import { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import { SimCloudFrontDistribution } from "../distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontResponseHeadersPolicy } from "../response-headers-policy/sim-cf-response-headers-policy.js";
import { SimCloudFrontCloudFormationResourceFactory } from "./sim-cfn-cloudfront-resource-factory.js";
import { simCfDistroConfigFactory } from "../distribution/sim-cf-distro-config.factory.js";

describe("SimCloudFrontCloudFormationResourceFactory", () => {
  it("creates a CloudFront Distribution", async () => {
    // Given a CloudFront CloudFormation Resource factory and a Distribution
    // resource.
    const simAws = new SimAws();
    const cloudFront = simAws.cloudFront();
    await simAws.s3().createBucket({
      input: {
        Bucket: "example-bucket",
      },
    });
    const resource = new SimCfnResource({
      accountRegionScope: {
        accountId: "111111111111" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
      logicalId: "SiteDistribution",
      template: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: simCfDistroConfigFactory.make({
            Aliases: {
              Items: ["www.example.test"],
            },
          }),
        },
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimCloudFrontCloudFormationResourceFactory(cloudFront);

    // When the Distribution resource type is created.
    const distribution = await factory.create(
      "Distribution",
      resource,
      context,
    );

    // Then a simulated Distribution is created and returned.
    assertInstanceOf(distribution, SimCloudFrontDistribution);
    assertTrue(distribution.hasAlternateDomainName("www.example.test"));
    assertIdentical(distribution.status, "Deploying");
    assertIdentical(
      cloudFront.getSimDistributionById(distribution.distributionId),
      distribution,
    );
  });

  it("creates a CloudFront Distribution from resolved properties", async () => {
    // Given a Distribution resource whose original template properties differ from
    // the resolved CloudFormation properties supplied in the creation context.
    const simAws = new SimAws();
    const cloudFront = simAws.cloudFront();
    await simAws.s3().createBucket({
      input: {
        Bucket: "example-bucket",
      },
    });
    const resource = new SimCfnResource({
      accountRegionScope: {
        accountId: "111111111111" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
      logicalId: "ResolvedSiteDistribution",
      template: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: simCfDistroConfigFactory.make({
            Aliases: {
              Items: ["unresolved.example.test"],
            },
          }),
        },
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
      resolvedProperties: {
        DistributionConfig: simCfDistroConfigFactory.make({
          Aliases: {
            Items: ["resolved.example.test"],
          },
        }),
      },
    };
    const factory = new SimCloudFrontCloudFormationResourceFactory(cloudFront);

    // When the Distribution resource type is created.
    const distribution = await factory.create(
      "Distribution",
      resource,
      context,
    );

    // Then the resolved properties are used for creation.
    assertInstanceOf(distribution, SimCloudFrontDistribution);
    assertTrue(distribution.hasAlternateDomainName("resolved.example.test"));
  });

  it("rejects unsupported CloudFront resource types", async () => {
    // Given a CloudFront CloudFormation Resource factory and an unsupported
    // Resource type.
    const simAws = new SimAws();
    const cloudFront = simAws.cloudFront();
    const resource = new SimCfnResource({
      accountRegionScope: {
        accountId: "111111111111" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
      logicalId: "ExampleUnsupportedResource",
      template: {
        Type: "AWS::CloudFront::UnsupportedResource",
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimCloudFrontCloudFormationResourceFactory(cloudFront);

    // When creation is attempted, then it rejects with an unsupported Resource
    // type error.
    const error = await assertThrowsErrorAsync(async () =>
      factory.create("UnsupportedResource", resource, context),
    );

    // Then the unsupported Resource type name is included for diagnosis.
    assertIdentical(
      error.message,
      "Unsupported sim CloudFront CloudFormation Resource UnsupportedResource",
    );
  });

  it("creates and deletes a response headers policy", async () => {
    // Given a CloudFront CloudFormation Resource factory and a response
    // headers policy resource.
    const simAws = new SimAws();
    const cloudFront = simAws.cloudFront();
    const resource = new SimCfnResource({
      logicalId: "CacheHeaders",
      template: {
        Type: "AWS::CloudFront::ResponseHeadersPolicy",
        Properties: {
          ResponseHeadersPolicyConfig: {
            Name: "CacheHeaders",
            CustomHeadersConfig: {
              Items: [
                { Header: "Vary", Override: true, Value: "Accept-Encoding" },
              ],
            },
          },
        },
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimCloudFrontCloudFormationResourceFactory(cloudFront);

    // When it is created.
    const policy = await factory.create(
      "ResponseHeadersPolicy",
      resource,
      context,
    );

    assertInstanceOf(policy, SimCloudFrontResponseHeadersPolicy);

    // Then sim CloudFront holds it, so a Behavior naming its ID finds it.
    assertNonNullable(cloudFront.getResponseHeadersPolicyById(policy.id));

    // And when the Resource is deleted, sim CloudFront forgets it.
    resource.markCreateComplete(policy);
    await factory.delete("ResponseHeadersPolicy", resource, {} as never);

    assertUndefined(cloudFront.getResponseHeadersPolicyById(policy.id));
  });

  it("steps over deleting a response headers policy that was never created", async () => {
    // Given a policy Resource whose creation did not get as far as a policy.
    const simAws = new SimAws();
    const factory = new SimCloudFrontCloudFormationResourceFactory(
      simAws.cloudFront(),
    );

    // When its deletion is attempted, then there is nothing to forget and
    // nothing is thrown.
    await factory.delete(
      "ResponseHeadersPolicy",
      new SimCfnResource({ logicalId: "CacheHeaders" }),
      {} as never,
    );
  });

  it("rejects a Distribution with a non-object DistributionConfig", async () => {
    // Given a CloudFront CloudFormation Resource factory and a Distribution
    // resource whose DistributionConfig cannot be passed to sim CloudFront.
    const simAws = new SimAws();
    const cloudFront = simAws.cloudFront();
    const resource = new SimCfnResource({
      accountRegionScope: {
        accountId: "111111111111" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
      logicalId: "InvalidDistribution",
      template: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: "not-an-object",
        },
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimCloudFrontCloudFormationResourceFactory(cloudFront);

    // When creation is attempted, then the DistributionConfig shape assertion
    // rejects it.
    const error = await assertThrowsErrorAsync(async () =>
      factory.create("Distribution", resource, context),
    );

    assertNonNullable(error);
    assertIdentical(
      error.message,
      "Invalid AWS::CloudFront::Distribution InvalidDistribution: DistributionConfig must be an object",
    );
  });
});
