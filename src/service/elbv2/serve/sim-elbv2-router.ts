import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { parseSimLambdaFunctionArn } from "../../lambda/function/sim-lambda-function-arn-parts.js";
import type { SimLambdaFunction } from "../../lambda/function/sim-lambda-function.js";
import type { SimElbV2LoadBalancer } from "../load-balancer/sim-elbv2-load-balancer.js";
import type { SimElbV2Registry } from "../registry/sim-elbv2-registry.js";
import type { SimElbV2 } from "../sim-elbv2.js";
import type { SimElbV2TargetGroup } from "../target-group/sim-elbv2-target-group.js";

interface SimElbV2RouterProperties {
  /**
   * The simulation to route within. Required, because a router with a
   * simulation of its own would find no load balancer anything created.
   */
  readonly simAws: SimAws;
}

/**
 * A load balancer a request reached, and the scope it lives in.
 */
export interface SimElbV2LoadBalancerRoute {
  readonly loadBalancer: SimElbV2LoadBalancer;
  readonly elbV2: SimElbV2;
}

/**
 * A function a target group invokes, and what decides whether it may.
 */
export interface SimElbV2FunctionTarget {
  readonly simFunction: SimLambdaFunction;
  /**
   * IAM of the Account owning the function, which is what the load balancer's
   * invoke permission is evaluated against.
   */
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Routes a request to the load balancer behind its host name, and a target
 * group to the function behind that.
 *
 * A host name names nothing but itself, while simulated ELBv2 state is per
 * Account and Region, and the registry is the hop between the two. The function
 * is not a second hop: real ELB
 * requires a Lambda target to be in the same Account and Region as its target
 * group, so that is the only scope it is looked for in.
 */
export class SimElbV2Router {
  /**
   * The simulation this router routes within.
   *
   * Exposed so collaborators needing the same simulation, such as the clock
   * stamping invocation events, take it from here rather than being given a
   * second SimAws that could be a different one.
   */
  public readonly simAws: SimAws;

  private readonly registry: SimElbV2Registry;

  constructor(properties: SimElbV2RouterProperties) {
    this.simAws = properties.simAws;
    this.registry = this.simAws.serviceFactory.elbV2Registry;
  }

  /**
   * Find the load balancer a request target addresses.
   */
  route(target: SimAwsServiceTarget): SimElbV2LoadBalancerRoute | undefined {
    const scope = this.registry.scopeForDnsName(target.resourceName);

    if (scope === undefined) {
      return undefined;
    }

    const elbV2 = this.simAws
      .accountRegionScope(scope.accountId, scope.regionName)
      .elbV2();
    const loadBalancer = elbV2.findLoadBalancerByDnsName(target.resourceName);

    // A registered DNS name is one that scope's own store holds, because the
    // store is what registers and deregisters it.
    assertDefined(
      loadBalancer,
      `${scope.accountId} in ${scope.regionName} is registered for the load ` +
        `balancer DNS name ${target.resourceName} and does not hold it`,
    );

    return { loadBalancer, elbV2 };
  }

  /**
   * Find the function registered in a target group, and the IAM deciding
   * whether the load balancer may invoke it.
   *
   * A target naming another Account or Region finds nothing. Real ELB refuses
   * to register one at all, so answering as though it were there would be the
   * looser of the two behaviours.
   */
  functionFor(
    targetGroup: SimElbV2TargetGroup,
  ): SimElbV2FunctionTarget | undefined {
    const target = targetGroup.registeredTargets[0];

    // A group with nothing in it never gets here: that is the 503 the load
    // balancer answers before it looks for a function.
    assertDefined(
      target,
      `Target group ${targetGroup.name} has no registered target`,
    );

    const parts = parseSimLambdaFunctionArn(target.id);
    const { accountId, regionName } = targetGroup.accountRegionScope;

    // A lambda target group refuses anything but a function ARN when the
    // target is registered, so a registered one is always readable.
    assertDefined(
      parts,
      `Target '${target.id}' in target group ${targetGroup.name} is not a ` +
        `Lambda function ARN`,
    );

    if (parts.accountId !== accountId || parts.regionName !== regionName) {
      return undefined;
    }

    const scope = this.simAws.accountRegionScope(accountId, regionName);
    const simFunction = scope.lambda().getSimFunctionByName(parts.functionName);

    if (simFunction === undefined) {
      return undefined;
    }

    return { simFunction, iam: scope.iam() };
  }
}
