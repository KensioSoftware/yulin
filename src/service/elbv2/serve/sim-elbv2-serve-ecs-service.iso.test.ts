import { DeleteServiceCommand } from "@aws-sdk/client-ecs";
import {
  assertIdentical,
  assertResponseStatus,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  servedServiceNames,
  simAwsWithServedService,
} from "../../../../test/ecs/served-service-fixture.js";
import type { SimAws } from "../../aws/sim-aws.js";
import { simElbV2Fetch } from "./sim-elbv2-fetch.js";

/**
 * The service the fixture builds, deleted, which is what leaves a target group
 * with nothing behind it.
 */
async function deleteServedService(simAws: SimAws): Promise<void> {
  await simAws.ecs().deleteService(
    new DeleteServiceCommand({
      cluster: servedServiceNames.cluster,
      service: servedServiceNames.service,
      force: true,
    }),
  );
}

describe("Serving a request through a simulated ECS service", () => {
  it("answers with what the service's bound container returned", async () => {
    // Given a load balancer forwarding to a target group an ECS service
    // registered its tasks into.
    const { simAws, hostname } = await simAwsWithServedService({
      containers: [
        {
          name: "app",
          ports: [8080],
          handler: async (request: Request): Promise<Response> =>
            Response.json(
              {
                method: request.method,
                path: new URL(request.url).pathname,
                body: await request.text(),
              },
              { status: 201, headers: { "content-type": "application/json" } },
            ),
        },
      ],
    });

    // When a request reaches the load balancer.
    const response = await simElbV2Fetch(simAws, `http://${hostname}/orders`, {
      method: "POST",
      body: "one flat white",
    });

    // Then the container's own response is what the client gets, request body
    // and all.
    assertResponseStatus(response, 201);
    expect(await response.json()).toStrictEqual({
      method: "POST",
      path: "/orders",
      body: "one flat white",
    });
  });

  it("hands the container the forwarding headers a load balancer writes", async () => {
    // Given a service whose container answers with what it was sent.
    const { simAws, hostname } = await simAwsWithServedService({
      containers: [
        {
          name: "app",
          ports: [8080],
          handler: (request: Request): Response =>
            new Response(
              [
                request.url,
                request.headers.get("host"),
                request.headers.get("x-forwarded-proto"),
                request.headers.get("x-forwarded-port"),
                request.headers.get("x-forwarded-for"),
                request.headers.get("x-amzn-trace-id")?.slice(0, 6),
              ].join(" "),
            ),
        },
      ],
    });

    // When a request reaches the load balancer.
    const response = await simElbV2Fetch(simAws, `http://${hostname}/orders`);

    // Then the container sees the name the client asked for and the listener
    // the request arrived on, as a container behind a real load balancer does.
    assertIdentical(
      await response.text(),
      `http://${hostname}/orders ${hostname} http 80 127.0.0.1 Root=1`,
    );
  });

  it("answers 503 when the target group holds no service tasks", async () => {
    // Given a load balancer whose target group had a service and no longer
    // does.
    const { simAws, hostname } = await simAwsWithServedService();
    await deleteServedService(simAws);

    // When a request reaches it.
    const response = await simElbV2Fetch(simAws, `http://${hostname}/orders`);

    // Then there is no target to send it to, which is what real ELB answers
    // for a group with nothing in service.
    assertResponseStatus(response, 503);
    assertStringIncludes(await response.text(), "503 Service Unavailable");
  });

  it("answers 503 when the service has no container that serves", async () => {
    // Given a service whose only container is one Yulin has nothing to run,
    // as an unbound proxy image is.
    const { simAws, hostname } = await simAwsWithServedService({
      containers: [{ name: "nginx", ports: [80] }],
      registration: { containerName: "nginx", containerPort: 80 },
    });

    // When a request reaches the load balancer.
    const response = await simElbV2Fetch(simAws, `http://${hostname}/orders`);

    // Then the tasks are registered and there is nothing behind them, which is
    // the honest answer rather than an empty 200.
    assertResponseStatus(response, 503);
  });

  it("answers 502 when the container's handler throws", async () => {
    // Given a service whose container fails on the request.
    const { simAws, hostname } = await simAwsWithServedService({
      containers: [
        {
          name: "app",
          ports: [8080],
          handler: (): Response => {
            throw new Error("no database connection");
          },
        },
      ],
    });

    // When a request reaches the load balancer.
    const response = await simElbV2Fetch(simAws, `http://${hostname}/orders`);

    // Then the load balancer answers for it, and the error goes no further
    // than the container, as it does on real AWS.
    assertResponseStatus(response, 502);
  });

  it("answers 502 when the container answers with something else", async () => {
    // Given a container whose handler answers with something that is not a
    // response, which only JavaScript with nothing checking it can do.
    const { simAws, hostname } = await simAwsWithServedService({
      containers: [
        {
          name: "app",
          ports: [8080],
          handler: (): Response => "ok" as unknown as Response,
        },
      ],
    });

    // When a request reaches the load balancer.
    const response = await simElbV2Fetch(simAws, `http://${hostname}/orders`);

    // Then the load balancer answers for it, as it does for a Lambda target
    // whose result it cannot use.
    assertResponseStatus(response, 502);
  });

  it("answers 503 for an address registered with no service behind it", async () => {
    // Given a target group holding an address nothing in the simulation
    // listens on.
    const { simAws, hostname, targetGroupArn } =
      await simAwsWithServedService();
    await deleteServedService(simAws);
    await simAws.elbV2().registerTargets({
      input: { TargetGroupArn: targetGroupArn, Targets: [{ Id: "10.0.9.9" }] },
    });

    // When a request reaches the load balancer.
    const response = await simElbV2Fetch(simAws, `http://${hostname}/orders`);

    // Then there is still nothing to serve it: an address is something an ECS
    // service registers, rather than something anything answers on.
    assertResponseStatus(response, 503);
  });
});

describe("Choosing the container of a task a request reaches", () => {
  it("routes to the bound container when the declared one is a proxy", async () => {
    // Given the common real shape: a proxy on the declared port, with the
    // application behind it, and only the application bound.
    const { simAws, hostname } = await simAwsWithServedService({
      containers: [
        { name: "nginx", ports: [80] },
        {
          name: "app",
          ports: [8080],
          handler: (): Response => new Response("app"),
        },
      ],
      registration: { containerName: "nginx", containerPort: 80 },
    });

    // When a request reaches the load balancer.
    const response = await simElbV2Fetch(simAws, `http://${hostname}/orders`);

    // Then the application answered, rather than the request being routed
    // strictly to a container that does not exist here.
    assertIdentical(await response.text(), "app");
  });

  it("chooses between bound containers by the declared container port", async () => {
    // Given a task whose two containers both answer requests.
    const { simAws, hostname } = await simAwsWithServedService({
      containers: [
        {
          name: "admin",
          ports: [9000],
          handler: (): Response => new Response("admin"),
        },
        {
          name: "app",
          ports: [8080],
          handler: (): Response => new Response("app"),
        },
      ],
      registration: { containerName: "nginx", containerPort: 9000 },
    });

    // When a request reaches the load balancer.
    const response = await simElbV2Fetch(simAws, `http://${hostname}/orders`);

    // Then the port the registration named is what chose between them.
    assertIdentical(await response.text(), "admin");
  });

  it("routes to the container the registration names", async () => {
    // Given a task whose two containers both answer, and a registration naming
    // one of them.
    const { simAws, hostname } = await simAwsWithServedService({
      containers: [
        {
          name: "admin",
          ports: [9000],
          handler: (): Response => new Response("admin"),
        },
        {
          name: "app",
          ports: [8080],
          handler: (): Response => new Response("app"),
        },
      ],
      registration: { containerName: "app", containerPort: 9000 },
    });

    // When a request reaches the load balancer.
    const response = await simElbV2Fetch(simAws, `http://${hostname}/orders`);

    // Then the container it names answered, whatever port it was registered
    // on, since naming a container is the more exact of the two.
    assertIdentical(await response.text(), "app");
  });

  it("routes to the first bound container when the port names none of them", async () => {
    // Given two bound containers, neither declaring the registered port.
    const { simAws, hostname } = await simAwsWithServedService({
      containers: [
        { name: "admin", handler: (): Response => new Response("admin") },
        { name: "app", handler: (): Response => new Response("app") },
      ],
      registration: { containerName: "nginx", containerPort: 80 },
    });

    // When a request reaches the load balancer.
    const response = await simElbV2Fetch(simAws, `http://${hostname}/orders`);

    // Then the first of them answers, since one of the containers that could
    // answer is nearer to the deployed behaviour than a 503.
    assertIdentical(await response.text(), "admin");
  });
});
