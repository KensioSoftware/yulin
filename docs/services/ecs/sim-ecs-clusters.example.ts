/**
 * Creating and describing a simulated ECS cluster.
 */

import {
  CreateClusterCommand,
  DescribeClustersCommand,
  ListClustersCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

await ecs.createCluster(
  new CreateClusterCommand({
    clusterName: "services",
    settings: [{ name: "containerInsights", value: "enabled" }],
    tags: [{ key: "team", value: "platform" }],
  }),
);

const described = await ecs.describeClusters(
  new DescribeClustersCommand({
    clusters: ["services"],
    include: ["SETTINGS", "TAGS"],
  }),
);

console.log(described.clusters?.[0]?.status); // "ACTIVE"
console.log(described.clusters?.[0]?.runningTasksCount); // 0
console.log(described.clusters?.[0]?.tags?.[0]?.key); // "team"

const listed = await ecs.listClusters(new ListClustersCommand({}));

console.log(listed.clusterArns?.[0]);
// "arn:aws:ecs:us-east-1:888888888888:cluster/services"
