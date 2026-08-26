import {
  CreateDistributionCommand,
  type DistributionConfig,
  type Origin,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { faker } from "@faker-js/faker";
import {
  assertArrayLength,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it, vi } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCloudFrontDistribution } from "../distribution/sim-cloudfront-distribution.js";

describe("CloudFront redundant Origins", () => {
  /**
   * An Origin fronting one HTTP API, with the given properties written over
   * whatever this says by default.
   */
  function apiOrigin(originId: string, origin: Partial<Origin> = {}): Origin {
    return {
      Id: originId,
      DomainName: "api.example.test",
      CustomOriginConfig: {
        OriginProtocolPolicy: "https-only",
        HTTPPort: 80,
        HTTPSPort: 443,
      },
      CustomHeaders: {
        Quantity: 1,
        Items: [{ HeaderName: "x-origin-secret", HeaderValue: "shibboleth" }],
      },
      ...origin,
    };
  }

  /**
   * A DistributionConfig declaring the given Origins, with the first of them
   * behind the default Behavior.
   */
  function distributionConfig(origins: readonly Origin[]): DistributionConfig {
    return {
      CallerReference: faker.string.uuid(),
      Comment: "Distribution over one API",
      Enabled: true,
      Origins: { Quantity: origins.length, Items: [...origins] },
      DefaultCacheBehavior: {
        TargetOriginId: origins.at(0)?.Id,
        ViewerProtocolPolicy: "redirect-to-https",
      },
    };
  }

  /**
   * Create a Distribution over the given Origins, answering with the simulated
   * Distribution itself, which is where a redundancy is recorded.
   */
  async function distributionOver(
    origins: readonly Origin[],
  ): Promise<SimCloudFrontDistribution> {
    const simCloudFront = new SimAws().cloudFront();
    const created = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: distributionConfig(origins),
      }),
    );

    assertNonNullable(created.Distribution?.Id);
    const distribution = simCloudFront.getSimDistributionById(
      created.Distribution.Id,
    );
    assertNonNullable(distribution);

    return distribution;
  }

  /**
   * Catch what the simulator warns about, so that a deploy which warns says so
   * here rather than in the suite's own output.
   */
  function capturedWarnings(): string[] {
    const warnings: string[] = [];

    vi.spyOn(console, "warn").mockImplementation((...parts: unknown[]) => {
      warnings.push(parts.map(String).join(" "));
    });

    return warnings;
  }

  it("records an Origin declared a second time under another Id", async () => {
    // Given a Distribution whose second Origin repeats the first in every
    // property but the Id. A Behavior added by copying the one above it leaves
    // exactly that behind.
    capturedWarnings();

    // When it is created.
    const distribution = await distributionOver([
      apiOrigin("ApiOrigin"),
      apiOrigin("ApiOriginTwo"),
    ]);

    // Then the repeat is recorded against the Origin it repeats.
    assertArrayLength(distribution.redundantOrigins, 1);
    assertObjectEquals(distribution.redundantOrigins[0], {
      originId: "ApiOriginTwo",
      repeatsOriginId: "ApiOrigin",
      domainName: "api.example.test",
    });
  });

  it("warns about the repeat as the Distribution is deployed", async () => {
    // Given somewhere to catch what the simulator warns about.
    const warnings = capturedWarnings();

    // When a Distribution declaring the same Origin twice is created.
    await distributionOver([apiOrigin("ApiOrigin"), apiOrigin("ApiOriginTwo")]);

    // Then it was warned about once, naming both Origins.
    assertArrayLength(warnings, 1);
    assertStringIncludes(String(warnings.at(0)), "ApiOriginTwo");
    assertStringIncludes(String(warnings.at(0)), "repeats Origin ApiOrigin");
  });

  it("leaves alone two Origins over one domain that differ", async () => {
    // Given two Origins over one API, reaching different paths on it. That is
    // what a second Origin over one domain is usually for.
    // When the Distribution is created.
    const distribution = await distributionOver([
      apiOrigin("ApiOrigin", { OriginPath: "/live" }),
      apiOrigin("PreviewOrigin", { OriginPath: "/preview" }),
    ]);

    // Then neither is called a repeat of the other.
    assertArrayLength(distribution.redundantOrigins, 0);
  });

  it("reads an Origin path written empty as no Origin path", async () => {
    // Given two Origins where one writes the empty Origin path CloudFront
    // takes as none, and the other leaves it out.
    capturedWarnings();

    // When the Distribution is created.
    const distribution = await distributionOver([
      apiOrigin("ApiOrigin"),
      apiOrigin("ApiOriginTwo", { OriginPath: "" }),
    ]);

    // Then they are still one Origin written twice.
    assertArrayLength(distribution.redundantOrigins, 1);
  });

  it("counts custom headers however they were written", async () => {
    // Given two Origins carrying the same two headers, written in a different
    // order and a different case, which HTTP makes no distinction between.
    capturedWarnings();
    const headers = [
      { HeaderName: "x-origin-secret", HeaderValue: "shibboleth" },
      { HeaderName: "x-origin-tenant", HeaderValue: "kettle" },
    ];

    // When the Distribution is created.
    const distribution = await distributionOver([
      apiOrigin("ApiOrigin", {
        CustomHeaders: { Quantity: 2, Items: headers },
      }),
      apiOrigin("ApiOriginTwo", {
        CustomHeaders: {
          Quantity: 2,
          Items: [
            { HeaderName: "X-Origin-Tenant", HeaderValue: "kettle" },
            { HeaderName: "X-Origin-Secret", HeaderValue: "shibboleth" },
          ],
        },
      }),
    ]);

    // Then they are one Origin written twice.
    assertArrayLength(distribution.redundantOrigins, 1);
  });

  it("tells apart two Origins by a list only one of them declares", async () => {
    // Given two Origins that differ by the protocols they accept, which is a
    // list rather than a value.
    // When the Distribution is created.
    const distribution = await distributionOver([
      apiOrigin("ApiOrigin", {
        CustomOriginConfig: {
          HTTPPort: 80,
          HTTPSPort: 443,
          OriginProtocolPolicy: "https-only",
          OriginSslProtocols: { Quantity: 1, Items: ["TLSv1.2"] },
        },
      }),
      apiOrigin("LegacyOrigin", {
        CustomOriginConfig: {
          HTTPPort: 80,
          HTTPSPort: 443,
          OriginProtocolPolicy: "https-only",
          OriginSslProtocols: { Quantity: 2, Items: ["TLSv1.2", "TLSv1.1"] },
        },
      }),
    ]);

    // Then neither is called a repeat of the other.
    assertArrayLength(distribution.redundantOrigins, 0);
  });

  it("forgets a repeat an update did away with", async () => {
    // Given a Distribution created with the same Origin declared twice.
    capturedWarnings();
    const simCloudFront = new SimAws().cloudFront();
    const declaredTwice = [apiOrigin("ApiOrigin"), apiOrigin("ApiOriginTwo")];
    const created = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: distributionConfig(declaredTwice),
      }),
    );
    assertNonNullable(created.Distribution?.Id);

    // When an update gives the second Origin a path of its own.
    const eachOnce = [
      apiOrigin("ApiOrigin"),
      apiOrigin("ApiOriginTwo", { OriginPath: "/preview" }),
    ];
    await simCloudFront.updateDistribution(
      new UpdateDistributionCommand({
        Id: created.Distribution.Id,
        DistributionConfig: distributionConfig(eachOnce),
      }),
    );

    // Then the Distribution no longer holds the repeat it was created with.
    const distribution = simCloudFront.getSimDistributionById(
      created.Distribution.Id,
    );
    assertNonNullable(distribution);
    assertArrayLength(distribution.redundantOrigins, 0);
  });
});
