import {
  assertIdentical,
  assertResponseStatus,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimElbV2LoadBalancer } from "../load-balancer/sim-elbv2-load-balancer.js";
import type { SimElbV2Event, SimElbV2Result } from "./sim-elbv2-event.type.js";
import { simElbV2LambdaTargetFactory } from "./sim-elbv2-lambda-target.factory.js";
import { simElbV2ServingTargetGroupFactory } from "./sim-elbv2-serving-target-group.factory.js";

/**
 * A load balancer whose target answers with the host name and forwarded port
 * the request reached it under.
 */
async function makeLoadBalancer(simAws: SimAws): Promise<SimElbV2LoadBalancer> {
  return await simElbV2LambdaTargetFactory.make(
    {
      handler: (event: SimElbV2Event): SimElbV2Result => ({
        statusCode: 200,
        body: `${event.headers["host"] ?? ""} ${
          event.headers["x-forwarded-port"] ?? ""
        }`,
      }),
    },
    simAws,
  );
}

/**
 * Point a name at a load balancer with an alias record, as a stack does.
 */
async function aliasTo(
  simAws: SimAws,
  name: string,
  loadBalancer: SimElbV2LoadBalancer,
): Promise<void> {
  const creation = await simAws.route53().createHostedZone({
    input: { Name: "example.test", CallerReference: "elbv2-serve-zone" },
  });

  await simAws.route53().changeResourceRecordSets({
    input: {
      HostedZoneId: creation.HostedZone?.Id,
      ChangeBatch: {
        Changes: [
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: name,
              Type: "A",
              AliasTarget: {
                DNSName: loadBalancer.dnsName,
                HostedZoneId: "Z0000000000000",
                EvaluateTargetHealth: false,
              },
            },
          },
        ],
      },
    },
  });

  await simAws.backgroundTasksComplete();
}

/**
 * Add a rule claiming requests for one host name.
 */
async function addHostRule(
  simAws: SimAws,
  loadBalancer: SimElbV2LoadBalancer,
  hostHeader: string,
  answer: string,
): Promise<void> {
  const elbV2 = simAws.elbV2();
  const targetGroup = await simElbV2ServingTargetGroupFactory.make(
    {
      name: answer,
      handler: (): SimElbV2Result => ({ statusCode: 200, body: answer }),
    },
    simAws,
  );
  const listener = elbV2.findListenerOnPort(loadBalancer.arn, 80);

  await elbV2.createRule({
    input: {
      ListenerArn: listener?.arn,
      Priority: 10,
      Conditions: [{ Field: "host-header", Values: [hostHeader] }],
      Actions: [{ Type: "forward", TargetGroupArn: targetGroup.arn }],
    },
  });
}

describe("Reaching a sim ELBv2 load balancer by the name it answers on", () => {
  it("carries a request made to an alias record to the load balancer", async () => {
    // Given a name pointing at a load balancer with an alias record
    const simAws = new SimAws();
    const loadBalancer = await makeLoadBalancer(simAws);
    await aliasTo(simAws, "api.example.test", loadBalancer);

    // When that name is requested at the local server, which carries the
    // Yulin-local suffix and the local server's port
    const response = await new SimAwsHttp({ simAws }).fetch(
      "http://api.example.test.sim-aws.localhost:52341/orders",
    );

    // Then the load balancer's target answered, seeing the name the request was
    // made to rather than the localhost one it arrived at, and the listener's
    // own port rather than the local server's
    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), "api.example.test 80");
  });

  it("matches a host header rule against the name the request was made to", async () => {
    // Given two names pointing at one load balancer, and a rule claiming one
    const simAws = new SimAws();
    const loadBalancer = await makeLoadBalancer(simAws);
    await aliasTo(simAws, "api.example.test", loadBalancer);
    await addHostRule(simAws, loadBalancer, "api.example.test", "api");

    const simAwsHttp = new SimAwsHttp({ simAws });

    // When requests arrive under the alias and under the load balancer's own
    // DNS name
    const claimed = await simAwsHttp.fetch(
      "http://api.example.test.sim-aws.localhost:52341/orders",
    );
    const missed = await simAwsHttp.fetch(
      `http://${loadBalancer.dnsName}.sim-aws.localhost:52341/orders`,
    );

    // Then the rule claimed the request made to the name it names, so
    // host-based routing and what Route53 resolved agree, and the request made
    // to the load balancer's own name fell through to the default action
    assertIdentical(await claimed.text(), "api");
    assertIdentical(await missed.text(), `${loadBalancer.dnsName} 80`);
  });

  it("says so when the name points at a load balancer that has been deleted", async () => {
    // Given a name pointing at a load balancer that has since been deleted
    const simAws = new SimAws();
    const loadBalancer = await makeLoadBalancer(simAws);
    await aliasTo(simAws, "api.example.test", loadBalancer);
    await simAws
      .elbV2()
      .deleteLoadBalancer({ input: { LoadBalancerArn: loadBalancer.arn } });

    // When the name is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      "http://api.example.test.sim-aws.localhost:52341/orders",
    );

    // Then the failure names the host name nothing answers on, rather than
    // reporting the name as one the simulator knows nothing about. There is no
    // load balancer to answer with a status of its own, so the served request
    // fails rather than being answered by anything ELB would have.
    assertResponseStatus(response, 500);
    assertStringIncludes(
      await response.text(),
      `No simulated load balancer answers on '${loadBalancer.dnsName}'`,
    );
  });
});
