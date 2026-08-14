import { AsyncMappedFactory } from "@kensio/part-factory";

import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import type { SimElbV2LoadBalancer } from "../load-balancer/sim-elbv2-load-balancer.js";
import {
  createFixtureLambdaTargetGroup,
  createFixtureListener,
  createFixtureLoadBalancer,
} from "../sim-elbv2.fixture.js";
import type { SimElbV2Event, SimElbV2Result } from "./sim-elbv2-event.type.js";
import { simElbV2ServicePrincipal } from "./sim-elbv2-invoke-authorizer.js";

/**
 * The load balancer, target group and function this builds.
 *
 * The names are fixed rather than asked for, so a test asserting on an ARN or
 * a DNS name has one value to write down.
 */
export const simElbV2LambdaTargetNames = {
  loadBalancer: "shop-alb",
  targetGroup: "checkout-tg",
  function: "checkout",
  /** The statement id the invoke permission is granted under. */
  invokeStatement: "elb-invoke",
} as const;

/**
 * What a test asks for when it wants a load balancer that serves something.
 */
export interface SimElbV2LambdaTargetInput {
  /** The function code the load balancer hands its requests to. */
  readonly handler: (event: SimElbV2Event) => unknown;
  /** The port the listener answers on. */
  readonly listenerPort: number;
}

/**
 * Creates a load balancer that forwards every request to a Lambda function,
 * through the ordinary commands.
 *
 * Five commands and a function stand between a test and a request a load
 * balancer can answer, and a test about answering one is about none of them.
 * Tests about the commands themselves send them one at a time instead.
 *
 * ```typescript
 * const loadBalancer = await simElbV2LambdaTargetFactory.make(
 *   { handler: () => ({ statusCode: 200, body: "hello" }) },
 *   simAws,
 * );
 * ```
 *
 * What comes back is a load balancer that serves: the function is registered
 * and it grants the load balancer the invoke action. A test about one of those
 * missing takes it away again, which is also what a working stack losing it
 * looks like.
 *
 * Everything is created in the default Account and Region of the simulated AWS
 * it is given, because real ELB requires a Lambda target to be in the same
 * Account and Region as its target group.
 */
export const simElbV2LambdaTargetFactory = new AsyncMappedFactory<
  SimElbV2LambdaTargetInput,
  SimElbV2LoadBalancer,
  SimAws
>(
  () => ({
    handler: (): SimElbV2Result => ({ statusCode: 200, body: "checkout" }),
    listenerPort: 80,
  }),
  async (input, simAws) => {
    const names = simElbV2LambdaTargetNames;
    const simLambda = simAws.lambda();
    const { FunctionArn } = await simLambda.createFunction({
      input: {
        FunctionName: names.function,
        Role: "arn:aws:iam::888888888888:role/CheckoutRole",
        Code: { ZipFile: makeLambdaZipFileInput(input.handler) },
      },
    });

    const elbV2 = simAws.elbV2();
    const balancerArn = await createFixtureLoadBalancer(
      elbV2,
      names.loadBalancer,
    );
    const groupArn = await createFixtureLambdaTargetGroup(
      elbV2,
      names.targetGroup,
    );

    await simLambda.addPermission({
      input: {
        FunctionName: names.function,
        StatementId: names.invokeStatement,
        Action: "lambda:InvokeFunction",
        Principal: simElbV2ServicePrincipal,
        SourceArn: groupArn,
      },
    });

    await elbV2.registerTargets({
      input: { TargetGroupArn: groupArn, Targets: [{ Id: FunctionArn }] },
    });

    await createFixtureListener(
      elbV2,
      balancerArn,
      groupArn,
      input.listenerPort,
    );

    // A load balancer CreateLoadBalancer reported is one the store holds, so
    // this is only missing if something is wrong with the simulator itself.
    const loadBalancer = elbV2.findLoadBalancerByName(names.loadBalancer);
    assertDefined(
      loadBalancer,
      `Simulated ELBv2 created the load balancer ${names.loadBalancer} and ` +
        `then did not hold it`,
    );

    return loadBalancer;
  },
);
