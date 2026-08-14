import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimElbV2Event, SimElbV2Result } from "./sim-elbv2-event.type.js";
import { simElbV2Fetch } from "./sim-elbv2-fetch.js";
import { simElbV2LambdaTargetFactory } from "./sim-elbv2-lambda-target.factory.js";

describe("Serving a request through a sim ELBv2 load balancer", () => {
  it("answers with what the Lambda target returned", async () => {
    // Given a load balancer forwarding to a target group holding a function
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make(
      {
        handler: (): SimElbV2Result => ({
          statusCode: 201,
          statusDescription: "201 Created",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ordered: true }),
        }),
      },
      simAws,
    );

    // When a request reaches the load balancer
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the handler's response is what the client gets, with the status
    // description as the reason phrase rather than repeated in the status line
    assertIdentical(response.status, 201);
    assertIdentical(response.statusText, "Created");
    assertIdentical(response.headers.get("content-type"), "application/json");
    expect(await response.json()).toStrictEqual({ ordered: true });
  });

  it("sends a body a handler omitted as no body at all", async () => {
    // Given a handler answering with a status and nothing else
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make(
      { handler: (): SimElbV2Result => ({ statusCode: 204 }) },
      simAws,
    );

    // When a request reaches it
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the response carries none, which is what a 204 has to be
    assertIdentical(response.status, 204);
    assertIdentical(response.body, null);
  });

  it("decodes a base64 body into the bytes the client receives", async () => {
    // Given a handler answering with base64 content, as it must for binary
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make(
      {
        handler: (): SimElbV2Result => ({
          statusCode: 200,
          headers: { "content-type": "application/octet-stream" },
          isBase64Encoded: true,
          body: Buffer.from([1, 2, 3]).toString("base64"),
        }),
      },
      simAws,
    );

    // When a request reaches it
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the load balancer decoded it before sending it on
    expect([...new Uint8Array(await response.arrayBuffer())]).toStrictEqual([
      1, 2, 3,
    ]);
  });

  it("drops the response headers a load balancer writes itself", async () => {
    // Given a handler naming hop-by-hop headers and its own content length
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make(
      {
        handler: (): SimElbV2Result => ({
          statusCode: 200,
          headers: {
            Connection: "keep-alive",
            "Content-Length": "9999",
            "X-Order": "42",
          },
          body: "checkout",
        }),
      },
      simAws,
    );

    // When a request reaches it
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then only the header the load balancer does not own survives
    assertIdentical(response.headers.get("connection"), null);
    assertIdentical(response.headers.get("x-order"), "42");
    assertIdentical(await response.text(), "checkout");
  });

  it("matches a listener by the port the request arrived on", async () => {
    // Given a load balancer whose only listener answers on 8080
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make(
      {
        listenerPort: 8080,
        handler: (event: SimElbV2Event): SimElbV2Result => ({
          statusCode: 200,
          body: event.headers["x-forwarded-port"] ?? "",
        }),
      },
      simAws,
    );

    // When a request reaches that port
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}:8080/orders`,
    );

    // Then that listener took it, and told the handler which port it was
    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "8080");
  });

  it("refuses a request to a port no listener answers on", async () => {
    // Given a load balancer listening on 80 only
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);

    // When a request reaches another port
    const request = simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}:8080/orders`,
    );

    // Then nothing answers, as a real load balancer refuses the connection
    // rather than sending back a status
    await expect(request).rejects.toThrow("has no listener on port 8080");
  });

  it("takes the scheme's own port when a request names none", async () => {
    // Given a load balancer listening on 80 only
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);

    // When an HTTPS request names no port
    const request = simElbV2Fetch(
      simAws,
      `https://${loadBalancer.dnsName}/orders`,
    );

    // Then it is looking for the listener on 443, which is what an HTTPS URL
    // naming no port means
    await expect(request).rejects.toThrow("has no listener on port 443");
  });

  it("stops answering on a deleted load balancer's DNS name", async () => {
    // Given a load balancer that has since been deleted
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    await simAws
      .elbV2()
      .deleteLoadBalancer({ input: { LoadBalancerArn: loadBalancer.arn } });

    // When a request reaches the name it answered on
    const request = simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the name resolves to nothing
    await expect(request).rejects.toThrow(
      "No simulated load balancer answers on",
    );
  });
});
