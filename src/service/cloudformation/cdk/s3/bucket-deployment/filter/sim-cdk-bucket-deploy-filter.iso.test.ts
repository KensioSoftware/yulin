import {
  assertFalse,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCdkBucketDeployFilter } from "./sim-cdk-bucket-deploy-filter.js";

describe("SimCdkBucketDeployFilter", () => {
  /**
   * A file the deployment copies.
   */
  function assertFileIncluded(
    deployFilter: SimCdkBucketDeployFilter,
    relativePath: string,
  ): void {
    const included = deployFilter.includes(relativePath);

    assertTrue(included);
  }

  /**
   * A file the deployment leaves behind.
   */
  function assertFileExcluded(
    deployFilter: SimCdkBucketDeployFilter,
    relativePath: string,
  ): void {
    const included = deployFilter.includes(relativePath);

    assertFalse(included);
  }

  function filter(
    exclude: string[] = [],
    include: string[] = [],
  ): SimCdkBucketDeployFilter {
    return new SimCdkBucketDeployFilter({ exclude, include });
  }

  it("copies every file when no filters are configured", () => {
    // Given a deployment with no Exclude or Include.
    const deployFilter = filter();

    // When any file is considered, then it is part of the deployment.
    assertFileIncluded(deployFilter, "index.html");
    assertFileIncluded(deployFilter, "data/standard.keys");
  });

  it("drops the files an exclude pattern matches", () => {
    // Given a deployment excluding the data directory.
    const deployFilter = filter(["data/*"]);

    // When files inside and outside it are considered.
    // Then only the ones outside it are copied.
    assertFileExcluded(deployFilter, "data/standard.keys");
    assertFileIncluded(deployFilter, "index.html");
  });

  it("lets a later include win over an earlier exclude", () => {
    // Given the common pair meaning "only the text files", which the CLI reads
    // as all the excludes first and then all the includes.
    const deployFilter = filter(["*"], ["*.txt"]);

    // When files of each kind are considered.
    // Then the last pattern to match decides.
    assertFileIncluded(deployFilter, "notes.txt");
    assertFileIncluded(deployFilter, "nested/notes.txt");
    assertFileExcluded(deployFilter, "index.html");
  });

  it("matches a star across directory separators", () => {
    // Given a deployment excluding everything under a directory.
    const deployFilter = filter(["data/*"]);

    // When a file nested more deeply is considered.
    // Then it is excluded too: the CLI's star crosses a slash.
    assertFileExcluded(deployFilter, "data/nested/deep.keys");
  });

  it("matches a single character with a question mark", () => {
    // Given a deployment excluding one-character names.
    const deployFilter = filter(["?.txt"]);

    // When names of each length are considered.
    // Then only the single-character one matches.
    assertFileExcluded(deployFilter, "a.txt");
    assertFileIncluded(deployFilter, "ab.txt");
  });

  it("matches a pattern against the whole relative path", () => {
    // Given a deployment excluding a named file.
    const deployFilter = filter(["index.html"]);

    // When a file of that name in a subdirectory is considered.
    // Then it is kept, because the pattern anchors to the whole path.
    assertFileExcluded(deployFilter, "index.html");
    assertFileIncluded(deployFilter, "nested/index.html");
  });

  it("treats regular expression characters in a pattern literally", () => {
    // Given a pattern containing characters a regular expression would read.
    const deployFilter = filter(["a+b(c).txt"]);

    // When the file that pattern names is considered.
    // Then it matches as written, and nothing else does.
    assertFileExcluded(deployFilter, "a+b(c).txt");
    assertFileIncluded(deployFilter, "aab c.txt");
  });

  it("reads a run of stars as one", () => {
    // Given a pattern written with a doubled star.
    const deployFilter = filter(["data/**"]);

    // When files inside and outside that directory are considered.
    // Then it means what a single star means, since a star already crosses a
    // slash, and a long near miss does not compile to nested wildcards.
    assertFileExcluded(deployFilter, "data/nested/deep.keys");
    assertFileIncluded(deployFilter, "index.html");
  });

  it("refuses a character class rather than mismatching it", () => {
    // Given a pattern using a character class, which the CLI supports and this
    // filter does not.
    // When the filter is built, then it refuses by naming the pattern.
    const error = assertThrowsError(() => filter(["[abc].txt"]));

    assertStringIncludes(error.message, "[abc].txt");
    assertStringIncludes(error.message, "character class");
  });
});
