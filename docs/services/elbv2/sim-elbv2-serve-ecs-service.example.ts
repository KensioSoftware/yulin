/**
 * A request reaching an ECS service's container through a load balancer.
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

import { SimSdk } from "@kensio/yulin/sdk";
import { SimAwsHttp } from "@kensio/yulin/serve";

using simSdk = new SimSdk();
const { simAws } = simSdk;

// The application's own SDK clients, intercepted as they would be in any test.
simSdk.intercept(DynamoDBClient);

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders",
  template: {
    Resources: {
      OrdersTable: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          TableName: "orders",
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "orderId", AttributeType: "S" },
          ],
          KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        },
      },
      OrdersTaskRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "OrdersTaskRole",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "ecs-tasks.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
          Policies: [
            {
              PolicyName: "ReadWriteOrders",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: ["dynamodb:PutItem", "dynamodb:GetItem"],
                    Resource: { "Fn::GetAtt": ["OrdersTable", "Arn"] },
                  },
                ],
              },
            },
          ],
        },
      },
      OrdersAlb: {
        Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
        Properties: { Name: "orders-alb", Scheme: "internet-facing" },
      },
      OrdersTargetGroup: {
        Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
        Properties: {
          Name: "orders-tg",
          TargetType: "ip",
          Protocol: "HTTP",
          Port: 80,
        },
      },
      HttpListener: {
        Type: "AWS::ElasticLoadBalancingV2::Listener",
        Properties: {
          LoadBalancerArn: { Ref: "OrdersAlb" },
          Protocol: "HTTP",
          Port: 80,
          DefaultActions: [
            { Type: "forward", TargetGroupArn: { Ref: "OrdersTargetGroup" } },
          ],
        },
      },
      OrdersZone: {
        Type: "AWS::Route53::HostedZone",
        Properties: { Name: "example.test" },
      },
      OrdersRecord: {
        Type: "AWS::Route53::RecordSet",
        Properties: {
          HostedZoneId: { Ref: "OrdersZone" },
          Name: "orders.example.test",
          Type: "A",
          AliasTarget: {
            DNSName: { "Fn::GetAtt": ["OrdersAlb", "DNSName"] },
            HostedZoneId: {
              "Fn::GetAtt": ["OrdersAlb", "CanonicalHostedZoneID"],
            },
          },
        },
      },
      OrdersCluster: {
        Type: "AWS::ECS::Cluster",
        Properties: { ClusterName: "orders" },
      },
      OrdersTaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Properties: {
          Family: "orders-api",
          NetworkMode: "awsvpc",
          TaskRoleArn: { "Fn::GetAtt": ["OrdersTaskRole", "Arn"] },
          ContainerDefinitions: [
            // The proxy the service registers, which Yulin has nothing to run.
            {
              Name: "nginx",
              Image: "public.ecr.aws/nginx/nginx:1.27",
              PortMappings: [{ ContainerPort: 80 }],
            },
            {
              Name: "app",
              Image: "example.dkr.ecr.eu-west-2.amazonaws.com/orders-api:1",
              PortMappings: [{ ContainerPort: 8080 }],
              Environment: [{ Name: "ORDERS_TABLE", Value: "orders" }],
            },
          ],
        },
      },
      OrdersService: {
        Type: "AWS::ECS::Service",
        Properties: {
          ServiceName: "orders-api",
          Cluster: { Ref: "OrdersCluster" },
          TaskDefinition: { Ref: "OrdersTaskDefinition" },
          DesiredCount: 2,
          LaunchType: "FARGATE",
          LoadBalancers: [
            {
              TargetGroupArn: { Ref: "OrdersTargetGroup" },
              ContainerName: "nginx",
              ContainerPort: 80,
            },
          ],
        },
      },
    },
  },
  bindings: [
    {
      logicalId: "OrdersTaskDefinition",
      containerName: "app",
      http: async (request: Request): Promise<Response> => {
        const dynamoDb = new DynamoDBClient({});
        const orderId = new URL(request.url).pathname.split("/").at(-1) ?? "";

        if (request.method === "POST") {
          await dynamoDb.send(
            new PutItemCommand({
              TableName: process.env["ORDERS_TABLE"],
              Item: { orderId: { S: orderId }, item: { S: "flat white" } },
            }),
          );

          return new Response("", { status: 201 });
        }

        const read = await dynamoDb.send(
          new GetItemCommand({
            TableName: process.env["ORDERS_TABLE"],
            Key: { orderId: { S: orderId } },
          }),
        );

        return Response.json({ item: read.Item?.["item"]?.S ?? null });
      },
    },
  ],
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

// The name Route53 answers for, reached in process rather than over a socket.
const client = new SimAwsHttp({ simAws });
const url = "http://orders.example.test.sim-aws.localhost:52341/orders/42";

const placed = await client.fetch(url, { method: "POST" });

console.log(placed.status); // 201

const read = await client.fetch(url);

console.log(await read.json()); // { item: "flat white" }
