/**
 * An application split across two services by path, with the rules matched
 * when a request arrives.
 */

import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateRuleCommand,
  CreateTargetGroupCommand,
  RegisterTargetsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import type { SimElbV2Result } from "@kensio/yulin/elbv2";
import { simElbV2Fetch, simElbV2ServicePrincipal } from "@kensio/yulin/elbv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const elbV2 = simAws.elbV2();
const lambda = simAws.lambda();

/**
 * Create a function answering with its own name, a target group holding it,
 * and the permission the load balancer needs to invoke it.
 */
async function makeTargetGroup(name: string): Promise<string> {
  const created = await lambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: name,
      Role: `arn:aws:iam::888888888888:role/${name}-role`,
      Code: {
        ZipFile: makeLambdaZipFileInput((): SimElbV2Result => ({
          statusCode: 200,
          body: name,
        })),
      },
    }),
  );

  const group = await elbV2.createTargetGroup(
    new CreateTargetGroupCommand({ Name: `${name}-tg`, TargetType: "lambda" }),
  );
  const groupArn = group.TargetGroups?.[0]?.TargetGroupArn;

  await lambda.addPermission(
    new AddPermissionCommand({
      FunctionName: name,
      StatementId: "elb-invoke",
      Action: "lambda:InvokeFunction",
      Principal: simElbV2ServicePrincipal,
      SourceArn: groupArn,
    }),
  );
  await elbV2.registerTargets(
    new RegisterTargetsCommand({
      TargetGroupArn: groupArn,
      Targets: [{ Id: created.FunctionArn }],
    }),
  );

  return groupArn ?? "";
}

const web = await makeTargetGroup("web");
const api = await makeTargetGroup("api");

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);
const listener = await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [{ Type: "forward", TargetGroupArn: web }],
  }),
);

await elbV2.createRule(
  new CreateRuleCommand({
    ListenerArn: listener.Listeners?.[0]?.ListenerArn,
    Priority: 10,
    Conditions: [{ Field: "path-pattern", Values: ["/api/*"] }],
    Actions: [{ Type: "forward", TargetGroupArn: api }],
  }),
);

const dnsName = loadBalancer.LoadBalancers?.[0]?.DNSName ?? "";

const toApi = await simElbV2Fetch(simAws, `http://${dnsName}/api/orders`);
console.log(await toApi.text()); // "api"

// The pattern has a slash the bare path does not, so this request is not one
// the rule claims, and the listener's default action answers it.
const toWeb = await simElbV2Fetch(simAws, `http://${dnsName}/api`);
console.log(await toWeb.text()); // "web"
