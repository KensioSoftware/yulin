/**
 * What a load balancer answers when its target cannot serve the request.
 */

import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
  RegisterTargetsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { simElbV2Fetch } from "@kensio/yulin/elbv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const simLambda = simAws.lambda();
const elbV2 = simAws.elbV2();

const created = await simLambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "checkout",
    Role: "arn:aws:iam::888888888888:role/CheckoutRole",
    // A handler written for an API Gateway proxy integration, which returns no
    // status code of its own.
    Code: { ZipFile: makeLambdaZipFileInput(() => ({ body: "checkout" })) },
  }),
);

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);
const targetGroup = await elbV2.createTargetGroup(
  new CreateTargetGroupCommand({ Name: "checkout-tg", TargetType: "lambda" }),
);

const targetGroupArn = targetGroup.TargetGroups?.[0]?.TargetGroupArn;
const dnsName = loadBalancer.LoadBalancers?.[0]?.DNSName;

await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
  }),
);

// Nothing is registered yet, so there is no target to send the request to.
const empty = await simElbV2Fetch(simAws, `http://${dnsName}/orders`);

console.log(empty.status); // 503

await simLambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "checkout",
    StatementId: "elb-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "elasticloadbalancing.amazonaws.com",
    SourceArn: targetGroupArn,
  }),
);
await elbV2.registerTargets(
  new RegisterTargetsCommand({
    TargetGroupArn: targetGroupArn,
    Targets: [{ Id: created.FunctionArn }],
  }),
);

// The function runs now, and what it returns is not a response ELB can send.
const malformed = await simElbV2Fetch(simAws, `http://${dnsName}/orders`);

console.log(malformed.status); // 502
