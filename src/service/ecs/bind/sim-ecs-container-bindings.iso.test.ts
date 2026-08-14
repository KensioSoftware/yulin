import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimEcsContainerDefinition } from "../task-definition/container/sim-ecs-container-definition.js";
import { SimEcsContainerBindings } from "./sim-ecs-container-bindings.js";

const appContainer = new SimEcsContainerDefinition({
  name: "app",
  image: "111111111111.dkr.ecr.eu-west-2.amazonaws.com/checkout:8f2c1a9b",
});

describe("Matching a simulated ECS container binding", () => {
  it("matches a binding naming the family and the container", () => {
    // Given a binding naming both.
    const bindings = new SimEcsContainerBindings();
    bindings.add({
      family: "checkout",
      containerName: "app",
      run: () => undefined,
    });

    // When a container of that family is looked up.
    const found = bindings.find("checkout", appContainer);

    // Then the binding is the one that matched.
    assertIdentical(found?.containerName, "app");
  });

  it("matches no container of another family", () => {
    // Given a binding for one family.
    const bindings = new SimEcsContainerBindings();
    bindings.add({
      family: "checkout",
      containerName: "app",
      run: () => undefined,
    });

    // When a same-named container of another family is looked up.
    const found = bindings.find("billing", appContainer);

    // Then nothing is bound to it.
    assertUndefined(found);
  });

  it("matches an image repository whatever the tag is", () => {
    // Given a binding naming the repository without a tag.
    const bindings = new SimEcsContainerBindings();
    bindings.add({
      imageRepository: "111111111111.dkr.ecr.eu-west-2.amazonaws.com/checkout",
      run: () => undefined,
    });

    // When a container running a tagged image from it is looked up.
    const found = bindings.find("checkout", appContainer);

    // Then the tag made no difference.
    assertIdentical(
      found?.imageRepository,
      "111111111111.dkr.ecr.eu-west-2.amazonaws.com/checkout",
    );
  });

  it("matches no image repository in another account", () => {
    // Given a binding naming a same-named repository elsewhere.
    const bindings = new SimEcsContainerBindings();
    bindings.add({
      imageRepository: "222222222222.dkr.ecr.eu-west-2.amazonaws.com/checkout",
      run: () => undefined,
    });

    // When the container is looked up.
    const found = bindings.find("checkout", appContainer);

    // Then the registry host is part of the repository, so it does not match.
    assertUndefined(found);
  });

  it("prefers a binding naming the container to one naming its image", () => {
    // Given both kinds of binding for the same container.
    const bindings = new SimEcsContainerBindings();
    bindings.add({
      family: "checkout",
      containerName: "app",
      run: () => undefined,
    });
    bindings.add({
      imageRepository: "111111111111.dkr.ecr.eu-west-2.amazonaws.com/checkout",
      run: () => undefined,
    });

    // When the container is looked up.
    const found = bindings.find("checkout", appContainer);

    // Then the more specific one wins, whichever was added first.
    assertIdentical(found?.containerName, "app");
  });

  it("replaces a binding when the same container is bound again", async () => {
    // Given a container bound twice.
    const bindings = new SimEcsContainerBindings();
    const ran: string[] = [];
    bindings.add({
      family: "checkout",
      containerName: "app",
      run: () => {
        ran.push("first");
      },
    });
    bindings.add({
      family: "checkout",
      containerName: "app",
      run: () => {
        ran.push("second");
      },
    });

    // When the binding that matched is run.
    await bindings.find("checkout", appContainer)?.runHandler();

    // Then it is the most recent one, so a test can rebind for one case.
    assertIdentical(ran.join(","), "second");
  });
});

describe("Refusing a simulated ECS container binding", () => {
  it("refuses an http handler, which nothing serves yet", () => {
    // Given the bindings for a scope.
    const bindings = new SimEcsContainerBindings();

    // When a container is bound to an HTTP handler.
    const error = assertThrowsError(() => {
      bindings.add({
        family: "checkout",
        containerName: "app",
        http: () => new Response("hello"),
      });
    });

    // Then it says so rather than accepting a handler nothing would call.
    assertStringIncludes(error.message, "http handler is not simulated");
  });

  it("refuses a binding that targets nothing", () => {
    // Given the bindings for a scope.
    const bindings = new SimEcsContainerBindings();

    // When a binding names a family without a container name.
    const error = assertThrowsError(() => {
      bindings.add({
        family: "checkout",
        containerName: "",
        run: () => undefined,
      });
    });

    // Then it is refused where the mistake is, rather than never matching.
    assertStringIncludes(error.message, "family and containerName");
  });

  it("refuses a binding with no handler at all", () => {
    // Given the bindings for a scope.
    const bindings = new SimEcsContainerBindings();

    // When a binding is made with nothing to run.
    const error = assertThrowsError(() => {
      bindings.add({
        family: "checkout",
        containerName: "app",
      } as unknown as Parameters<SimEcsContainerBindings["add"]>[0]);
    });

    // Then it is refused.
    assertStringIncludes(error.message, "needs a run handler");
  });
});
