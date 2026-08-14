import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnImageRepositoryTarget } from "./sim-cfn-image-repository-target.js";

const ordersRepository = "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders";

describe("Sim CloudFormation image repository binding target", () => {
  it("matches an image URI naming the repository, whatever its tag", () => {
    // Given a binding target naming a repository with no tag.
    const target = new SimCfnImageRepositoryTarget(ordersRepository);

    // When image URIs from that repository are matched against it.
    // Then the tag makes no difference, including a content hash tag of the
    // kind CDK gives an image asset.
    assertTrue(target.matchesImageUri(`${ordersRepository}:latest`));
    assertTrue(target.matchesImageUri(`${ordersRepository}:2f0e1d`));
    assertTrue(target.matchesImageUri(ordersRepository));
    assertTrue(target.matchesImageUri(`${ordersRepository}@sha256:2f0e1d`));
  });

  it("ignores a tag on the binding target itself", () => {
    // Given a binding target that names a tag anyway.
    const target = new SimCfnImageRepositoryTarget(
      `${ordersRepository}:latest`,
    );

    // When an image URI with a different tag is matched against it.
    // Then it still matches, because no tag is stable enough to match on.
    assertTrue(target.matchesImageUri(`${ordersRepository}:2f0e1d`));
  });

  it("matches a repository named in a different case", () => {
    // Given a binding target naming the registry host in upper case.
    const target = new SimCfnImageRepositoryTarget(
      "111111111111.DKR.ECR.EU-WEST-2.AMAZONAWS.COM/orders",
    );

    // When the image URI from the template is matched against it.
    // Then case is not what separates one repository from another.
    assertTrue(target.matchesImageUri(`${ordersRepository}:latest`));
  });

  it("keeps a registry port out of the tag", () => {
    // Given a binding target on a registry host carrying a port.
    const target = new SimCfnImageRepositoryTarget(
      "registry.example.test:5000/orders",
    );

    // When a tagged image URI from that registry is matched against it.
    // Then the port is read as part of the host rather than as a tag.
    assertTrue(target.matchesImageUri("registry.example.test:5000/orders:v2"));
    assertFalse(target.matchesImageUri("registry.example.test:5000/invoices"));
  });

  it("does not match another repository, account or region", () => {
    // Given a binding target naming one repository in one account and region.
    const target = new SimCfnImageRepositoryTarget(ordersRepository);

    // When image URIs differing in only one of those are matched against it.
    // Then none of them match, so a binding cannot reach a same-named
    // repository somewhere else.
    assertFalse(
      target.matchesImageUri(
        "111111111111.dkr.ecr.eu-west-2.amazonaws.com/invoices:latest",
      ),
    );
    assertFalse(
      target.matchesImageUri(
        "222222222222.dkr.ecr.eu-west-2.amazonaws.com/orders:latest",
      ),
    );
    assertFalse(
      target.matchesImageUri(
        "111111111111.dkr.ecr.us-east-1.amazonaws.com/orders:latest",
      ),
    );
  });

  it("does not match a function with no image URI", () => {
    // Given a binding target and a function packaged as a zip.
    const target = new SimCfnImageRepositoryTarget(ordersRepository);

    // When there is no image URI to match.
    // Then the binding does not target it.
    assertFalse(target.matchesImageUri(undefined));
  });
});
