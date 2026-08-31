import { describe, it } from "vitest";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";

import { SimCloudFrontAliasCoverage } from "./sim-cf-alias-coverage.js";

describe("SimCloudFrontAliasCoverage", () => {
  it("covers an exactly matching domain name", () => {
    // Given a certificate for one domain name.
    const coverage = new SimCloudFrontAliasCoverage(["example.test"]);

    // When that domain name is used as an alias, then it is covered.
    assertArrayEmpty(coverage.uncovered(["example.test"]));
  });

  it("covers a subject alternative name", () => {
    // Given a certificate with a subject alternative name.
    const coverage = new SimCloudFrontAliasCoverage([
      "example.test",
      "www.example.test",
    ]);

    // When both names are used as aliases, then both are covered.
    assertArrayEmpty(coverage.uncovered(["example.test", "www.example.test"]));
  });

  it("covers one label with a wildcard", () => {
    // Given a wildcard certificate.
    const coverage = new SimCloudFrontAliasCoverage(["*.example.test"]);

    // When a single-label subdomain is used as an alias, then it is covered.
    assertArrayEmpty(coverage.uncovered(["www.example.test"]));
  });

  it("does not cover the apex with a wildcard", () => {
    // Given a wildcard certificate, which in AWS does not cover the apex.
    const coverage = new SimCloudFrontAliasCoverage(["*.example.test"]);

    // When the apex is used as an alias, then it is not covered.
    const uncovered = coverage.uncovered(["example.test"]);

    assertArrayLength(uncovered, 1);
    assertIdentical(uncovered[0], "example.test");
  });

  it("does not cover a deeper subdomain with a wildcard", () => {
    // Given a wildcard certificate, which stands for exactly one label.
    const coverage = new SimCloudFrontAliasCoverage(["*.example.test"]);

    // When a two-label subdomain is used as an alias, then it is not covered.
    assertArrayLength(coverage.uncovered(["deep.www.example.test"]), 1);
  });

  it("ignores case and trailing dots", () => {
    // Given a certificate whose domain name is absolute and mixed case.
    const coverage = new SimCloudFrontAliasCoverage(["Example.Test."]);

    // When the alias differs only in case and trailing dot, it is covered.
    assertArrayEmpty(coverage.uncovered(["example.test"]));
  });

  it("reports every uncovered alias", () => {
    // Given a certificate for one domain name.
    const coverage = new SimCloudFrontAliasCoverage(["example.test"]);

    // When unrelated aliases are used, then each one is reported.
    assertArrayLength(
      coverage.uncovered(["one.other.test", "two.other.test"]),
      2,
    );
  });
});
