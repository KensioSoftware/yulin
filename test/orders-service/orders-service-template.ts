import type { CfnTemplateBodyRecord } from "../../src/service/cloudformation/template/sim-cfn-template.js";
import { ordersServiceNames } from "./orders-service-names.js";

const names = ordersServiceNames;

/**
 * The table the application reads and writes, and the Role it does it as.
 */
const dataResources: CfnTemplateBodyRecord["Resources"] = {
  OrdersTable: {
    Type: "AWS::DynamoDB::Table",
    Properties: {
      TableName: names.table,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
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
};

/**
 * The load balancer the requests arrive at, and the name it answers on.
 */
const frontDoorResources: CfnTemplateBodyRecord["Resources"] = {
  OrdersAlb: {
    Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
    Properties: {
      Name: "orders-alb",
      Scheme: "internet-facing",
      Subnets: ["subnet-1111", "subnet-2222"],
    },
  },
  OrdersTargetGroup: {
    Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
    Properties: {
      Name: "orders-tg",
      TargetType: "ip",
      Protocol: "HTTP",
      Port: names.proxyPort,
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
    Properties: { Name: names.zone },
  },
  OrdersRecord: {
    Type: "AWS::Route53::RecordSet",
    Properties: {
      HostedZoneId: { Ref: "OrdersZone" },
      Name: names.hostname,
      Type: "A",
      AliasTarget: {
        DNSName: { "Fn::GetAtt": ["OrdersAlb", "DNSName"] },
        HostedZoneId: { "Fn::GetAtt": ["OrdersAlb", "CanonicalHostedZoneID"] },
      },
    },
  },
};

/**
 * The service that answers, with the proxy container a real task carries in
 * front of the application.
 */
const serviceResources: CfnTemplateBodyRecord["Resources"] = {
  OrdersCluster: {
    Type: "AWS::ECS::Cluster",
    Properties: { ClusterName: names.cluster },
  },
  OrdersTaskDefinition: {
    Type: "AWS::ECS::TaskDefinition",
    Properties: {
      Family: names.family,
      TaskRoleArn: { "Fn::GetAtt": ["OrdersTaskRole", "Arn"] },
      NetworkMode: "awsvpc",
      ContainerDefinitions: [
        {
          Name: names.proxy,
          Image: "public.ecr.aws/nginx/nginx:1.27",
          PortMappings: [{ ContainerPort: names.proxyPort }],
        },
        {
          Name: names.container,
          Image: "example.dkr.ecr.eu-west-2.amazonaws.com/orders-api:1",
          PortMappings: [{ ContainerPort: names.applicationPort }],
          Environment: [
            { Name: "ORDERS_TABLE", Value: { Ref: "OrdersTable" } },
          ],
        },
      ],
    },
  },
  OrdersService: {
    Type: "AWS::ECS::Service",
    Properties: {
      ServiceName: names.service,
      Cluster: { Ref: "OrdersCluster" },
      TaskDefinition: { Ref: "OrdersTaskDefinition" },
      DesiredCount: 2,
      LaunchType: "FARGATE",
      LoadBalancers: [
        {
          TargetGroupArn: { Ref: "OrdersTargetGroup" },
          ContainerName: names.proxy,
          ContainerPort: names.proxyPort,
        },
      ],
    },
  },
};

/**
 * The stack the orders service is deployed from.
 *
 * It is the shape a real one has: a table, a task Role that may read and write
 * it, a cluster and task definition, a service registered into a target group,
 * and a load balancer behind a Route53 name. The one thing worth pointing at is
 * the task definition, which declares an nginx container on the port the
 * service registers and the application behind it on another, which is what a
 * great many deployed services look like.
 */
export const ordersServiceTemplate: CfnTemplateBodyRecord = {
  Resources: {
    ...dataResources,
    ...frontDoorResources,
    ...serviceResources,
  },
  Outputs: {
    TargetGroup: { Value: { Ref: "OrdersTargetGroup" } },
  },
};
