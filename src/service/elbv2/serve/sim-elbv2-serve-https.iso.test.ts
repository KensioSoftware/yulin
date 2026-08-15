import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimElbV2LoadBalancer } from "../load-balancer/sim-elbv2-load-balancer.js";
import {
  createFixtureCertificate,
  createFixtureHttpsListener,
  createFixtureListener,
  createFixtureLoadBalancer,
  createFixtureRule,
} from "../sim-elbv2.fixture.js";
import type { SimElbV2Event, SimElbV2Result } from "./sim-elbv2-event.type.js";
import { simElbV2Fetch } from "./sim-elbv2-fetch.js";
import { simElbV2ServingTargetGroupFactory } from "./sim-elbv2-serving-target-group.factory.js";

/**
 * Answer with the target group's own name, so a response says which one took
 * the request.
 */
function namingHandler(name: string): () => SimElbV2Result {
  return (): SimElbV2Result => ({ statusCode: 200, body: name });
}

/**
 * Answer with the protocol and port the load balancer said the request arrived
 * on.
 */
function forwardedHandler(event: SimElbV2Event): SimElbV2Result {
  return {
    statusCode: 200,
    body: `${String(event.headers["x-forwarded-proto"])} ${String(
      event.headers["x-forwarded-port"],
    )}`,
  };
}

/**
 * A load balancer answering on both an HTTP and an HTTPS listener, each with
 * the same default action and the same rule.
 *
 * The two listeners are what makes a test about HTTPS a comparison rather than
 * an assertion on its own: whatever the HTTP one answers, the HTTPS one has to
 * answer too.
 */
async function makeBothListeners(
  simAws: SimAws,
  handler: (event: SimElbV2Event) => SimElbV2Result,
): Promise<SimElbV2LoadBalancer> {
  const elbV2 = simAws.elbV2();
  const checkout = await simElbV2ServingTargetGroupFactory.make(
    { name: "checkout", handler: namingHandler("checkout") },
    simAws,
  );
  const api = await simElbV2ServingTargetGroupFactory.make(
    { name: "api", handler },
    simAws,
  );
  const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
  const certificateArn = await createFixtureCertificate(simAws);

  const http = await createFixtureListener(
    elbV2,
    loadBalancerArn,
    checkout.arn,
  );
  const https = await createFixtureHttpsListener(
    elbV2,
    loadBalancerArn,
    checkout.arn,
    certificateArn,
  );

  await createFixtureRule(elbV2, http, 10, api.arn, "shop.example.com");
  await createFixtureRule(elbV2, https, 10, api.arn, "shop.example.com");

  const loadBalancer = elbV2.findLoadBalancerByName("shop-alb");
  assertDefined(loadBalancer, "Sim ELBv2 created no load balancer shop-alb");

  return loadBalancer;
}

describe("Serving a sim ELBv2 request over HTTPS", () => {
  it("evaluates the same rules and reaches the same targets as HTTP", async () => {
    // Given a load balancer with an HTTP and an HTTPS listener carrying the
    // same rule
    const simAws = new SimAws();
    const loadBalancer = await makeBothListeners(simAws, namingHandler("api"));

    // When the same request is sent to each of them
    const insecure = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
      { headers: { host: "shop.example.com" } },
    );
    const secure = await simElbV2Fetch(
      simAws,
      `https://${loadBalancer.dnsName}/orders`,
      { headers: { host: "shop.example.com" } },
    );

    // Then the rule claimed both, and the same target group answered
    assertIdentical(await insecure.text(), "api");
    assertIdentical(await secure.text(), "api");
  });

  it("falls through to the HTTPS listener's own default action", async () => {
    // Given the same load balancer, whose rule is on one host name only
    const simAws = new SimAws();
    const loadBalancer = await makeBothListeners(simAws, namingHandler("api"));

    // When a request no rule claims arrives on 443
    const response = await simElbV2Fetch(
      simAws,
      `https://${loadBalancer.dnsName}/orders`,
    );

    // Then the listener's default action answered it
    assertIdentical(await response.text(), "checkout");
  });

  it("tells the target the request arrived over HTTPS", async () => {
    // Given a load balancer whose target reports the forwarding headers
    const simAws = new SimAws();
    const loadBalancer = await makeBothListeners(simAws, forwardedHandler);

    // When a request reaches each listener
    const insecure = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
      { headers: { host: "shop.example.com" } },
    );
    const secure = await simElbV2Fetch(
      simAws,
      `https://${loadBalancer.dnsName}/orders`,
      { headers: { host: "shop.example.com" } },
    );

    // Then the protocol the event carries is the listener's own, since that is
    // the protocol the request is treated as having arrived on
    assertIdentical(await insecure.text(), "http 80");
    assertIdentical(await secure.text(), "https 443");
  });
});
