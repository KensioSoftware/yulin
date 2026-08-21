import { AsyncMappedFactory } from "@kensio/part-factory";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../src/service/cloudformation/stack/sim-cfn-deployed-stack.type.js";
import { handleOrdersRequest } from "./orders-service-handler.js";
import { ordersServiceNames } from "./orders-service-names.js";
import { ordersServiceTemplate } from "./orders-service-template.js";

/**
 * What a test asks for when it wants the orders service standing up.
 *
 * There is nothing to choose: the whole point of the scenario is the ordinary
 * deployment, so what a test varies is the requests it then makes.
 */
export type OrdersServiceInput = Record<string, never>;

/**
 * A deployed orders service, and where to reach it.
 */
export interface OrdersService {
  readonly simAws: SimAws;
  readonly stack: SimCfnDeployedStack;
  /** The Route53 name the load balancer answers on. */
  readonly hostname: string;
}

/**
 * Deploys the orders service from its CloudFormation template.
 *
 * The application container is bound by the logical ID of the task definition
 * Resource, which is what a template has and a `RegisterTaskDefinition` call
 * does not. The nginx container in front of it is left unbound, because there
 * is no nginx here to run: what answers is the application, as the load
 * balancer routes to a container that is actually there.
 */
export const ordersServiceFactory = new AsyncMappedFactory<
  OrdersServiceInput,
  OrdersService,
  SimAws
>(
  () => ({}),
  async (_input, simAws) => {
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: ordersServiceNames.stack,
      template: ordersServiceTemplate,
      bindings: [
        {
          logicalId: "OrdersTaskDefinition",
          containerName: ordersServiceNames.container,
          http: handleOrdersRequest,
        },
      ],
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    return { simAws, stack, hostname: ordersServiceNames.hostname };
  },
);
