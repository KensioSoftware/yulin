import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimEcrImageReference } from "./sim-ecr-image-reference.js";

describe("SimEcrImageReference", () => {
  it("reads the repository a tagged image URI names", () => {
    // Given an image URI with a tag on it.
    const reference = new SimEcrImageReference(
      " 111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders:latest ",
    );

    // Then the repository is what is left with the tag and the padding gone.
    assertIdentical(
      reference.repositoryKey(),
      "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders",
    );
    assertIdentical(reference.imageTag(), "latest");
  });

  it("reads a repository named in mixed case as the same repository", () => {
    // Given the same repository written two ways, as a DNS name can be.
    const lower = new SimEcrImageReference(
      "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders:1",
    );
    const upper = new SimEcrImageReference(
      "111111111111.DKR.ECR.EU-WEST-2.amazonaws.com/orders:1",
    );

    // Then both read as one repository.
    assertIdentical(lower.repositoryKey(), upper.repositoryKey());
  });

  it("asks for no tag where the reference names a digest", () => {
    // Given an image referenced by digest, as a pinned deployment does.
    const reference = new SimEcrImageReference(
      "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders@sha256:0f9c1e",
    );

    // Then the repository is read and no tag is asked for.
    assertIdentical(
      reference.repositoryKey(),
      "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders",
    );
    assertUndefined(reference.imageTag());
  });

  it("asks for no tag where the reference carries none", () => {
    // Given a bare repository reference, and one on a registry with a port.
    const bare = new SimEcrImageReference(
      "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders",
    );
    const ported = new SimEcrImageReference("registry.test:5000/orders");

    // Then neither asks for a tag, and the port stays part of the registry.
    assertUndefined(bare.imageTag());
    assertUndefined(ported.imageTag());
    assertIdentical(ported.repositoryKey(), "registry.test:5000/orders");
  });
});
