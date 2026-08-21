import { assertArrayLength, assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCfnIsContainerBinding,
  simCfnIsExecutableBinding,
  type SimCfnBinding,
} from "./sim-cfn-binding.js";

const orders: string[] = [];
const ordersHandler = (): string => "ordered";
const processOrders = (): void => {
  orders.push("processed");
};
const serveOrders = (): Response => new Response();

describe("Sim CloudFormation binding", () => {
  it("holds both kinds of binding in one list", () => {
    // Given a list of bindings a consumer built away from the deploy call.
    const bindings: readonly SimCfnBinding[] = [
      { logicalId: "OrdersFunction", handler: ordersHandler },
      { cdkPath: "Orders/RewriteFunction", handler: ordersHandler },
      { family: "orders-worker", containerName: "app", run: processOrders },
      { imageRepository: "example/orders-web", http: serveOrders },
    ];

    // When the deployment sorts them into the two kinds.
    const executable = bindings.filter((binding) =>
      simCfnIsExecutableBinding(binding),
    );
    const containers = bindings.filter((binding) =>
      simCfnIsContainerBinding(binding),
    );

    // Then both kinds came out of the one list.
    assertArrayLength(executable, 2);
    assertArrayLength(containers, 2);
  });

  it("reads a Lambda image repository binding as executable", () => {
    // Given a binding naming the repository a container image function runs.
    const binding: SimCfnBinding = {
      imageRepository: "example/orders",
      handler: ordersHandler,
    };

    // When the deployment asks which kind it is.
    // Then the handler makes it an executable Resource binding, even though a
    // container binding may name a repository too.
    assertTrue(simCfnIsExecutableBinding(binding));
    assertFalse(simCfnIsContainerBinding(binding));
  });

  it("refuses a binding naming two targets at once", () => {
    // Given a binding literal that names a Resource two ways.
    // @ts-expect-error a binding names one target, and this one names two.
    const binding: SimCfnBinding = {
      logicalId: "OrdersFunction",
      functionName: "orders",
      handler: ordersHandler,
    };

    // When it is read at run time.
    // Then the compile step is what refused it, and the object itself is an
    // ordinary executable binding.
    assertTrue(simCfnIsExecutableBinding(binding));
  });
});
