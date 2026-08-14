import { RegisterTaskDefinitionCommand } from "@aws-sdk/client-ecs";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimEcsClientException } from "../../error/sim-ecs.error.js";

describe("Validating a simulated ECS task definition registration", () => {
  it("refuses a registration with no family", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a task definition is registered without a family.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.registerTaskDefinition({
        input: { containerDefinitions: [{ name: "app", image: "checkout:1" }] },
      }),
    );

    // Then ECS refuses it.
    assertInstanceOf(error, SimEcsClientException);
    assertIdentical(error.name, "ClientException");
    assertStringIncludes(error.message, "family cannot be blank");
  });

  it("refuses a family name ECS would not accept", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a family name carries a character ECS does not allow.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.registerTaskDefinition(
        new RegisterTaskDefinitionCommand({
          family: "check out",
          containerDefinitions: [{ name: "app", image: "checkout:1" }],
        }),
      ),
    );

    // Then it is refused here rather than on deployment.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "Invalid task definition family");
  });

  it("refuses a registration with no container definitions", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a task definition declares no containers.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.registerTaskDefinition(
        new RegisterTaskDefinitionCommand({
          family: "checkout",
          containerDefinitions: [],
        }),
      ),
    );

    // Then ECS refuses it.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "at least one container definition");
  });

  it("refuses a container with no name", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a container is declared without a name.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.registerTaskDefinition(
        new RegisterTaskDefinitionCommand({
          family: "checkout",
          containerDefinitions: [{ image: "checkout:1" }],
        }),
      ),
    );

    // Then ECS refuses it, because a name is how a container is referred to.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "Container.name");
  });

  it("refuses a container with no image", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a container is declared without an image.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.registerTaskDefinition(
        new RegisterTaskDefinitionCommand({
          family: "checkout",
          containerDefinitions: [{ name: "app" }],
        }),
      ),
    );

    // Then ECS refuses it. Nothing reads the image, but it is the identifier
    // a bound handler would be matched against.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "Container.image");
  });

  it("refuses two containers sharing a name", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When two containers are declared under the same name.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.registerTaskDefinition(
        new RegisterTaskDefinitionCommand({
          family: "checkout",
          containerDefinitions: [
            { name: "app", image: "checkout:1" },
            { name: "app", image: "sidecar:1" },
          ],
        }),
      ),
    );

    // Then ECS refuses it.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "declared more than once");
  });

  it("refuses a declaration this simulation does not hold", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a registration asks for fault injection.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.registerTaskDefinition(
        new RegisterTaskDefinitionCommand({
          family: "checkout",
          containerDefinitions: [{ name: "app", image: "checkout:1" }],
          enableFaultInjection: true,
        }),
      ),
    );

    // Then it is refused rather than dropped, so nothing declared goes
    // missing from the revision it made.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(
      error.message,
      "enableFaultInjection is not simulated",
    );
  });

  it("registers nothing when the registration is refused", async () => {
    // Given simulated ECS that has refused a registration.
    const simEcs = new SimAws().ecs();
    await assertThrowsErrorAsync(async () =>
      simEcs.registerTaskDefinition(
        new RegisterTaskDefinitionCommand({
          family: "checkout",
          containerDefinitions: [{ name: "app" }],
        }),
      ),
    );

    // When the family is registered properly afterwards.
    const registered = await simEcs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // Then it is revision 1, because the refused request took no number.
    assertIdentical(registered.taskDefinition?.revision, 1);
  });
});
