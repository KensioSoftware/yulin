import {
  assertIdentical,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimElbV2ActionInput } from "../command/sim-elbv2-shared.command.js";
import type { SimElbV2LoadBalancer } from "../load-balancer/sim-elbv2-load-balancer.js";
import { simElbV2Fetch } from "./sim-elbv2-fetch.js";
import { simElbV2LambdaTargetFactory } from "./sim-elbv2-lambda-target.factory.js";

/**
 * Add a rule answering a path with an action needing no target group.
 */
async function addRule(
  simAws: SimAws,
  loadBalancer: SimElbV2LoadBalancer,
  path: string,
  action: SimElbV2ActionInput,
): Promise<void> {
  const elbV2 = simAws.elbV2();
  const listener = elbV2.findListenerOnPort(loadBalancer.arn, 80);

  assertDefined(listener, `No listener on port 80 of ${loadBalancer.name}`);

  await elbV2.createRule({
    input: {
      ListenerArn: listener.arn,
      Priority: 10,
      Conditions: [{ Field: "path-pattern", Values: [path] }],
      Actions: [action],
    },
  });
}

describe("Answering a sim ELBv2 request without a target", () => {
  it("answers a fixed-response rule with what it holds", async () => {
    // Given a rule answering a health path itself
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    await addRule(simAws, loadBalancer, "/health", {
      Type: "fixed-response",
      FixedResponseConfig: {
        StatusCode: "200",
        ContentType: "application/json",
        MessageBody: '{"ok":true}',
      },
    });

    // When a request arrives at it
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/health`,
    );

    // Then the load balancer wrote the response itself, with no function
    // invoked and no target group named by the action at all
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(response.headers.get("content-type"), "application/json");
    assertIdentical(await response.text(), '{"ok":true}');
  });

  it("sends no body and no content type when a fixed response names none", async () => {
    // Given a fixed response that is only a status code
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    await addRule(simAws, loadBalancer, "/gone", {
      Type: "fixed-response",
      FixedResponseConfig: { StatusCode: "410" },
    });

    // When a request arrives at it
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/gone`,
    );

    // Then nothing is invented to go with the status
    assertResponseStatus(response, 410, await describeResponse(response));
    assertIdentical(response.headers.get("content-type"), null);
    assertIdentical(await response.text(), "");
  });

  it("sends no body with a status that cannot carry one", async () => {
    // Given a fixed response on a status with no body
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    await addRule(simAws, loadBalancer, "/ping", {
      Type: "fixed-response",
      FixedResponseConfig: { StatusCode: "204", MessageBody: "pong" },
    });

    // When a request arrives at it
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/ping`,
    );

    // Then the message body is dropped, as a 204 has to have none
    assertResponseStatus(response, 204, await describeResponse(response));
    assertIdentical(response.body, null);
  });

  it("answers a listener whose default action is a fixed response", async () => {
    // Given a listener answering everything itself rather than forwarding
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    const elbV2 = simAws.elbV2();

    await elbV2.modifyListener({
      input: {
        ListenerArn: elbV2.findListenerOnPort(loadBalancer.arn, 80)?.arn,
        DefaultActions: [
          {
            Type: "fixed-response",
            FixedResponseConfig: {
              StatusCode: "404",
              ContentType: "text/plain",
              MessageBody: "no route",
            },
          },
        ],
      },
    });

    // When a request arrives
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the default action answered it, with no target involved
    assertResponseStatus(response, 404, await describeResponse(response));
    assertIdentical(await response.text(), "no route");
  });

  it("redirects with the components a rule names and keeps the rest", async () => {
    // Given a rule redirecting to HTTPS, which is the usual reason to have one
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    await addRule(simAws, loadBalancer, "/*", {
      Type: "redirect",
      RedirectConfig: {
        Protocol: "HTTPS",
        Port: "443",
        StatusCode: "HTTP_301",
      },
    });

    // When a request arrives on the HTTP listener
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders?ref=email`,
      { headers: { host: "shop.example.com" } },
    );

    // Then the host, path and query came through untouched, and the port is in
    // the Location even though it is the protocol's own, which is what real
    // ELB sends
    assertResponseStatus(response, 301, await describeResponse(response));
    assertIdentical(
      response.headers.get("location"),
      "https://shop.example.com:443/orders?ref=email",
    );
    assertIdentical(response.body, null);
  });

  it("substitutes the reserved keywords a redirect writes", async () => {
    // Given a redirect building each component out of the request's own
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    await addRule(simAws, loadBalancer, "/*", {
      Type: "redirect",
      RedirectConfig: {
        Protocol: "#{protocol}",
        Host: "new.#{host}",
        Port: "#{port}",
        Path: "/moved/#{path}",
        Query: "#{query}&moved=1",
        StatusCode: "HTTP_302",
      },
    });

    // When a request arrives
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders/42?ref=email`,
      { headers: { host: "shop.example.com" } },
    );

    // Then each keyword was replaced with the request's own value, and
    // #{path} came without its leading slash, which is why the path a redirect
    // keeps is written as /#{path}
    assertResponseStatus(response, 302, await describeResponse(response));
    assertIdentical(
      response.headers.get("location"),
      "http://new.shop.example.com:80/moved/orders/42?ref=email&moved=1",
    );
  });

  it("leaves the question mark off a redirect with no query string", async () => {
    // Given a redirect keeping the request's query string
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    await addRule(simAws, loadBalancer, "/*", {
      Type: "redirect",
      RedirectConfig: { Host: "www.example.com", StatusCode: "HTTP_301" },
    });

    // When a request with no query string arrives
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the Location ends at the path, since the question mark is ELB's to
    // add rather than the configuration's
    assertIdentical(
      response.headers.get("location"),
      "http://www.example.com:80/orders",
    );
  });
});
