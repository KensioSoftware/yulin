import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimEcrRegistry } from "./sim-ecr-registry.js";

const accountIdTwoTwos = "222222222222" as SimAwsAccountId;

const ordersRepositoryUri =
  "888888888888.dkr.ecr.us-east-1.amazonaws.com/orders";

/**
 * The registry one simulation's repositories are indexed in, reached the way
 * the rest of the simulation reaches it.
 */
function registryOf(simAws: SimAws): SimEcrRegistry {
  // The repositories of every scope are indexed together, so any scope's ECR
  // resolves the same way. Building one here keeps the test to the registry.
  const registry = new SimEcrRegistry();

  for (const repository of simAws.ecr().allRepositories()) {
    registry.register(repository);
  }

  return registry;
}

describe("SimEcrRegistry", () => {
  it("resolves a repository from an image URI of any tag", () => {
    // Given a repository in the default account and region.
    const simAws = new SimAws();
    const repository = simAws.ecr().repository("orders");
    const registry = registryOf(simAws);

    // When image URIs naming it by tag, by digest and by nothing are resolved.
    // Then each finds the repository, because the tag is not its identity.
    assertIdentical(
      registry.repositoryFor(`${ordersRepositoryUri}:latest`),
      repository,
    );
    assertIdentical(
      registry.repositoryFor(`${ordersRepositoryUri}:2f0e1dab4c`),
      repository,
    );
    assertIdentical(
      registry.repositoryFor(`${ordersRepositoryUri}@sha256:0f9c1e`),
      repository,
    );
    assertIdentical(registry.repositoryFor(ordersRepositoryUri), repository);
  });

  it("keeps a same-named repository in another account apart", () => {
    // Given repositories of one name in two accounts.
    const simAws = new SimAws();

    simAws.ecr().repository("orders");

    const otherAccount = simAws
      .accountRegionScope(accountIdTwoTwos)
      .ecr()
      .repository("orders");
    const registry = new SimEcrRegistry();

    registry.register(simAws.ecr().repository("orders"));
    registry.register(otherAccount);

    // When each account's image URI is resolved.
    const found = registry.repositoryFor(`${ordersRepositoryUri}:latest`);
    const otherFound = registry.repositoryFor(otherAccount.repositoryUri);

    // Then each URI finds the repository in its own account, because the
    // registry host is part of what a repository is.
    assertNonNullable(found);
    assertIdentical(otherFound, otherAccount);
    assertFalse(found === otherAccount);
  });

  it("finds nothing for a repository no simulated ECR holds", () => {
    // Given a simulation holding one repository.
    const simAws = new SimAws();

    simAws.ecr().repository("orders");

    const registry = registryOf(simAws);

    // When an image URI naming another repository is resolved.
    // Then nothing is found, which is a different answer from a repository
    // holding no image.
    assertUndefined(
      registry.repositoryFor(
        "888888888888.dkr.ecr.us-east-1.amazonaws.com/invoices:latest",
      ),
    );
  });

  it("stops resolving a repository that has been deregistered", () => {
    // Given a registered repository.
    const simAws = new SimAws();
    const registry = new SimEcrRegistry();
    const repository = simAws.ecr().repository("orders");

    registry.register(repository);

    // When it is deregistered, as deleting one does.
    registry.deregister(repository);

    // Then its image URI resolves to nothing.
    assertUndefined(registry.repositoryFor(`${ordersRepositoryUri}:latest`));
  });
});
