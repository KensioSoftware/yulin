/**
 * A simulated ECS service answering requests behind a load balancer.
 */

import {
  CreateClusterCommand,
  CreateServiceCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";
import { simElbV2Fetch } from "@kensio/yulin/elbv2";

const simAws = new SimAws();
const ecs = simAws.ecs();
const elbV2 = simAws.elbV2();

const targetGroup = await elbV2.createTargetGroup(
  new CreateTargetGroupCommand({
    Name: "orders-tg",
    TargetType: "ip",
    Protocol: "HTTP",
    Port: 8080,
  }),
);

const targetGroupArn = targetGroup.TargetGroups?.[0]?.TargetGroupArn;

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "orders-alb" }),
);

await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
  }),
);

await ecs.createCluster(new CreateClusterCommand({ clusterName: "orders" }));

ecs.bindContainer({
  family: "orders-api",
  containerName: "app",
  http: (request) => {
    const { pathname } = new URL(request.url);

    return Response.json({ path: pathname }, { status: 200 });
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "orders-api",
    containerDefinitions: [
      {
        name: "app",
        image: "orders-api:1",
        portMappings: [{ containerPort: 8080 }],
      },
    ],
  }),
);

await ecs.createService(
  new CreateServiceCommand({
    cluster: "orders",
    serviceName: "orders-api",
    taskDefinition: "orders-api",
    desiredCount: 2,
    loadBalancers: [
      { targetGroupArn, containerName: "app", containerPort: 8080 },
    ],
  }),
);

// The tasks come up in the background, as they do on real ECS, and each of
// them is registered in the target group as it starts.
await simAws.backgroundTasksComplete();

const dnsName = loadBalancer.LoadBalancers?.[0]?.DNSName;
const response = await simElbV2Fetch(simAws, `http://${dnsName}/orders/42`);

console.log(response.status); // 200
console.log(await response.json()); // { path: "/orders/42" }
