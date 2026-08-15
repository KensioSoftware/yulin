/**
 * The parts a test needs before it can say anything about an ECS container
 * answering a request: a target group of addresses, a load balancer forwarding
 * to it, a task definition whose containers are bound to handlers, and a
 * service registered into the target group.
 *
 * These live under `test/` for the same reason as the consuming service
 * fixture: the lint rules reject a test file exporting helpers alongside its
 * own `describe` calls.
 */

import {
  CreateServiceCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import { PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import { simEcsClusterFactory } from "../../src/service/ecs/cluster/sim-ecs-cluster.factory.js";
import type { SimEcsContainerHttpHandler } from "../../src/service/ecs/index.js";
import { simIamRoleWithPolicyFactory } from "../../src/service/iam/role/sim-iam-role-with-policy.factory.js";

/**
 * The names a served service is built under, so a test asserting on one has a
 * single place to read it from.
 */
export const servedServiceNames = {
  cluster: "orders",
  family: "checkout",
  service: "checkout",
  targetGroup: "checkout-tg",
  loadBalancer: "shop-alb",
  container: "app",
  containerPort: 8080,
  listenerPort: 80,
} as const;

/**
 * One container of the served task definition.
 *
 * A container with no handler is one Yulin has nothing to run, which is what a
 * proxy or a log router in a real task definition is.
 */
export interface ServedContainer {
  readonly name: string;
  readonly ports?: readonly number[];
  readonly handler?: SimEcsContainerHttpHandler;
  readonly environment?: readonly { name: string; value: string }[];
}

interface ServedServiceOptions {
  readonly simAws?: SimAws;
  readonly containers?: readonly ServedContainer[];
  /** The container and port the service registers into the target group. */
  readonly registration?: { containerName: string; containerPort: number };
  readonly desiredCount?: number;
  readonly taskRoleArn?: string;
  /** Leave the load balancer out, for a test only about the registration. */
  readonly withoutLoadBalancer?: boolean;
}

/**
 * One simulated AWS with a service answering behind a load balancer.
 */
export interface SimEcsServedServiceFixture {
  readonly simAws: SimAws;
  readonly targetGroupArn: string;
  /** The host name a request reaches the load balancer on. */
  readonly hostname: string;
}

/**
 * The container a test gets when it does not say, which answers with its own
 * name so a test can tell which container took the request.
 */
function defaultContainers(): readonly ServedContainer[] {
  return [
    {
      name: servedServiceNames.container,
      ports: [servedServiceNames.containerPort],
      handler: (): Response => new Response(servedServiceNames.container),
    },
  ];
}

/**
 * Create the target group a service registers into, and answer with its ARN.
 */
export async function makeServedTargetGroup(
  simAws: SimAws,
  elbV2 = simAws.elbV2(),
): Promise<string> {
  const created = await elbV2.createTargetGroup(
    new CreateTargetGroupCommand({
      Name: servedServiceNames.targetGroup,
      TargetType: "ip",
      Protocol: "HTTP",
      Port: servedServiceNames.containerPort,
    }),
  );
  const targetGroupArn = created.TargetGroups?.[0]?.TargetGroupArn;

  assertNonNullable(targetGroupArn, "CreateTargetGroup answered with an ARN");

  return targetGroupArn;
}

/**
 * Create a load balancer forwarding everything to a target group, and answer
 * with the host name it answers on.
 */
async function makeLoadBalancer(
  simAws: SimAws,
  targetGroupArn: string,
): Promise<string> {
  const elbV2 = simAws.elbV2();
  const created = await elbV2.createLoadBalancer(
    new CreateLoadBalancerCommand({ Name: servedServiceNames.loadBalancer }),
  );
  const loadBalancer = created.LoadBalancers?.[0];

  assertNonNullable(loadBalancer?.DNSName, "CreateLoadBalancer answered");

  await elbV2.createListener(
    new CreateListenerCommand({
      LoadBalancerArn: loadBalancer.LoadBalancerArn,
      Protocol: "HTTP",
      Port: servedServiceNames.listenerPort,
      DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
    }),
  );

  return loadBalancer.DNSName;
}

/**
 * Make a simulated AWS with a load balancer routing to a running service.
 *
 * The service is up and its containers are answering by the time this answers,
 * so a test can send a request and assert on what came back.
 */
export async function simAwsWithServedService(
  options: ServedServiceOptions = {},
): Promise<SimEcsServedServiceFixture> {
  const simAws = options.simAws ?? new SimAws();
  const containers = options.containers ?? defaultContainers();
  const ecs = simAws.ecs();
  const targetGroupArn = await makeServedTargetGroup(simAws);
  const hostname =
    options.withoutLoadBalancer === true
      ? ""
      : await makeLoadBalancer(simAws, targetGroupArn);

  for (const container of containers) {
    bindServedContainer(simAws, container);
  }

  await simEcsClusterFactory.make(
    { clusterName: servedServiceNames.cluster },
    simAws,
  );
  await ecs.registerTaskDefinition(
    new RegisterTaskDefinitionCommand({
      family: servedServiceNames.family,
      ...(options.taskRoleArn !== undefined && {
        taskRoleArn: options.taskRoleArn,
      }),
      containerDefinitions: containers.map((container) => ({
        name: container.name,
        image: `${container.name}:1`,
        portMappings: (container.ports ?? []).map((port) => ({
          containerPort: port,
        })),
        ...(container.environment !== undefined && {
          environment: [...container.environment],
        }),
      })),
    }),
  );
  await ecs.createService(
    new CreateServiceCommand({
      cluster: servedServiceNames.cluster,
      serviceName: servedServiceNames.service,
      taskDefinition: servedServiceNames.family,
      desiredCount: options.desiredCount ?? 1,
      loadBalancers: [
        {
          targetGroupArn,
          containerName:
            options.registration?.containerName ?? servedServiceNames.container,
          containerPort:
            options.registration?.containerPort ??
            servedServiceNames.containerPort,
        },
      ],
    }),
  );
  await simAws.backgroundTasksComplete();

  return { simAws, targetGroupArn, hostname };
}

/**
 * Bind a container that has a handler, and leave one that has none alone.
 */
function bindServedContainer(simAws: SimAws, container: ServedContainer): void {
  if (container.handler === undefined) {
    return;
  }

  simAws.ecs().bindContainer({
    family: servedServiceNames.family,
    containerName: container.name,
    http: container.handler,
  });
}

/**
 * What a served container does with a request when the test is about what it
 * is allowed to do: write what it was sent to a parameter, through an ordinary
 * SDK client, and answer with what happened.
 *
 * A denial comes back as the response rather than as a thrown error, so a test
 * can read what simulated IAM said rather than only the 502 the load balancer
 * would turn it into.
 */
export async function writeLastOrder(request: Request): Promise<Response> {
  try {
    await new SSMClient({}).send(
      new PutParameterCommand({
        Name: "/orders/last-handled",
        Value: await request.text(),
        Type: "String",
      }),
    );
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "", {
      status: 500,
    });
  }

  return new Response("written");
}

/**
 * A served service whose container writes a parameter, running as a task Role
 * allowed the actions it is given and nothing else.
 */
export async function servedServiceAsRole(
  simAws: SimAws,
  actions: readonly string[],
): Promise<string> {
  const taskRole = await simIamRoleWithPolicyFactory.make(
    { roleName: "OrdersTaskRole", actions },
    simAws,
  );
  const { hostname } = await simAwsWithServedService({
    simAws,
    taskRoleArn: taskRole.Arn,
    containers: [
      {
        name: servedServiceNames.container,
        ports: [servedServiceNames.containerPort],
        handler: writeLastOrder,
      },
    ],
  });

  return hostname;
}
