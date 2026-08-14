/**
 * A request carried through a load balancer to a Lambda function.
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
import type { SimElbV2Event, SimElbV2Result } from "@kensio/yulin/elbv2";
import { simElbV2Fetch } from "@kensio/yulin/elbv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const region = simAws.account("888888888888").region("eu-west-1");

const created = await region.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "checkout",
    Role: "arn:aws:iam::888888888888:role/CheckoutRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: SimElbV2Event): SimElbV2Result => ({
          statusCode: 200,
          statusDescription: "200 OK",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: event.path, method: event.httpMethod }),
          isBase64Encoded: false,
        }),
      ),
    },
  }),
);

const elbV2 = region.elbV2();

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);
const targetGroup = await elbV2.createTargetGroup(
  new CreateTargetGroupCommand({ Name: "checkout-tg", TargetType: "lambda" }),
);

const targetGroupArn = targetGroup.TargetGroups?.[0]?.TargetGroupArn;

// Without this the load balancer cannot invoke the function, and every request
// gets a 502.
await region.lambda().addPermission(
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

await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
  }),
);

const dnsName = loadBalancer.LoadBalancers?.[0]?.DNSName;

const response = await simElbV2Fetch(simAws, `http://${dnsName}/orders`);

console.log(response.status); // 200
console.log(response.statusText); // "OK"
console.log(await response.json()); // { path: "/orders", method: "GET" }
