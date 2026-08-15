import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimEcsContainerDefinition } from "../../../task-definition/container/sim-ecs-container-definition.js";
import { SimEcsContainerSecrets } from "./sim-ecs-container-secrets.js";
import type { SimEcsSecretStores } from "./sim-ecs-secret-stores.js";

/**
 * A store that answers every read the same way.
 *
 * Both cases here are about what a store hands back rather than about which
 * store it is, so the two real ones are stood in for.
 */
class SimEcsFixedSecretStore implements SimEcsSecretStores {
  private readonly answer: () => string;

  constructor(answer: () => string) {
    this.answer = answer;
  }

  read(): Promise<string> {
    return Promise.resolve(this.answer());
  }
}

const executionRoleArn = "arn:aws:iam::111111111111:role/OrdersExecutionRole";

describe("Resolving one container's declared secrets", () => {
  it("names each variable the value its reference read", async () => {
    // Given a container declaring two secrets.
    const declared = new SimEcsContainerDefinition({
      name: "app",
      image: "orders-worker:1",
      secrets: [
        { name: "DB_PASSWORD", valueFrom: "/orders/db" },
        { name: "API_KEY", valueFrom: "/orders/api-key" },
      ],
    });
    const secrets = new SimEcsContainerSecrets({
      stores: new SimEcsFixedSecretStore(() => "value"),
      executionRoleArn,
    });

    // When they are resolved.
    const resolved = await secrets.resolve(declared);

    // Then both variables are set.
    assertIdentical(resolved["DB_PASSWORD"], "value");
    assertIdentical(resolved["API_KEY"], "value");
  });

  it("reports a store that threw something other than an Error", async () => {
    // Given a store whose failure is not an Error, as an unwrapped rejection
    // from anything reached across a service boundary may not be.
    const declared = new SimEcsContainerDefinition({
      name: "app",
      image: "orders-worker:1",
      secrets: [{ name: "DB_PASSWORD", valueFrom: "/orders/db" }],
    });
    const secrets = new SimEcsContainerSecrets({
      stores: new SimEcsFixedSecretStore(() => {
        // oxlint-disable-next-line only-throw-error -- what this test is about
        throw "the store gave up";
      }),
      executionRoleArn,
    });

    // When the secrets are resolved.
    let reason = "";

    try {
      await secrets.resolve(declared);
    } catch (error) {
      reason = error instanceof Error ? error.message : "";
    }

    // Then the reason still names the variable and reads the failure out.
    assertStringIncludes(reason, "unable to pull secrets: DB_PASSWORD");
    assertStringIncludes(reason, "the store gave up");
  });
});
