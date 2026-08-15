import { BackgroundTasks } from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { SimIamAllowAllAuth } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type * as elbV2 from "./command/sim-elbv2-command.types.js";
import { SimElbV2Commands } from "./command/sim-elbv2-commands.js";
import type { SimElbV2RequestOptions } from "./command/sim-elbv2-request-options.js";
import type { SimElbV2ListenerRule } from "./listener/rule/sim-elbv2-listener-rule.js";
import type { SimElbV2Listener } from "./listener/sim-elbv2-listener.js";
import type { SimElbV2LoadBalancer } from "./load-balancer/sim-elbv2-load-balancer.js";
import { SimElbV2Registry } from "./registry/sim-elbv2-registry.js";
import { SimElbV2SdkCommandRouter } from "./sdk/sim-elbv2-sdk-command-router.js";
import { SimElbV2Stores } from "./sim-elbv2-stores.js";
import type { SimElbV2Properties } from "./sim-elbv2.types.js";
import type { SimElbV2TargetGroup } from "./target-group/sim-elbv2-target-group.js";

/**
 * Simulated Elastic Load Balancing v2. Handles SDK commands. Emulates AWS
 * behaviour and state.
 *
 * This is the Application Load Balancer and nothing else. Network and gateway
 * load balancers route below HTTP, which nothing in this simulation speaks, so
 * they are refused rather than created as something they are not.
 *
 * What a load balancer here is, so far, is state: it has a DNS name of the
 * shape real ELB issues, so a Route53 alias or a CloudFront origin has
 * something to point at, and it has listeners, rules and target groups that
 * say what it would do with a request. Answering one is separate work.
 *
 * Load balancers are scoped to an account and region, as they are on real AWS:
 * a name is unique within one of those scopes and an ARN names the region.
 */
export class SimElbV2 {
  private readonly stores: SimElbV2Stores;
  private readonly commands: SimElbV2Commands;
  private readonly sdkRouter = new SimElbV2SdkCommandRouter(this);

  constructor(properties: SimElbV2Properties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      registry = new SimElbV2Registry(),
    } = properties;

    this.stores = new SimElbV2Stores({ registry });
    this.commands = new SimElbV2Commands({
      stores: this.stores,
      iam,
      background,
      accountRegionScope,
      acmRegistry: properties.acmRegistry,
    });
  }

  /**
   * Find a load balancer by name.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting load
   * balancer state without going through a Command and its authorization.
   */
  findLoadBalancerByName(name: string): SimElbV2LoadBalancer | undefined {
    return this.stores.loadBalancers.findByName(name);
  }

  /**
   * Find the load balancer answering on a DNS name.
   *
   * This is what a request reaching a load balancer starts from, since the DNS
   * name is the only thing it carries that names one.
   */
  findLoadBalancerByDnsName(dnsName: string): SimElbV2LoadBalancer | undefined {
    return this.stores.loadBalancers.findByDnsName(dnsName);
  }

  /**
   * Find the listener answering on one port of a load balancer.
   */
  findListenerOnPort(
    loadBalancerArn: string,
    port: number,
  ): SimElbV2Listener | undefined {
    return this.stores.listeners.findOnPort(loadBalancerArn, port);
  }

  /**
   * The rules on one listener, in the order that listener evaluates them.
   *
   * This is what a request arriving at a listener is matched against, before
   * it falls through to the listener's own default action.
   */
  findRulesForListener(listenerArn: string): readonly SimElbV2ListenerRule[] {
    return this.stores.rules.forListener(listenerArn);
  }

  /**
   * Find a target group by ARN.
   */
  findTargetGroupByArn(arn: string): SimElbV2TargetGroup | undefined {
    return this.stores.targetGroups.findByArn(arn);
  }

  /** Handle a CreateLoadBalancer Command from the SDK. */
  async createLoadBalancer(
    command: elbV2.SimCreateLoadBalancerCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimCreateLoadBalancerCommandOutput> {
    return await this.commands.createLoadBalancer.handle(command, options);
  }

  /** Handle a DescribeLoadBalancers Command from the SDK. */
  async describeLoadBalancers(
    command: elbV2.SimDescribeLoadBalancersCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimDescribeLoadBalancersCommandOutput> {
    return await this.commands.describeLoadBalancers.handle(command, options);
  }

  /** Handle a DeleteLoadBalancer Command from the SDK. */
  async deleteLoadBalancer(
    command: elbV2.SimDeleteLoadBalancerCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimDeleteLoadBalancerCommandOutput> {
    return await this.commands.deleteLoadBalancer.handle(command, options);
  }

  /** Handle a CreateTargetGroup Command from the SDK. */
  async createTargetGroup(
    command: elbV2.SimCreateTargetGroupCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimCreateTargetGroupCommandOutput> {
    return await this.commands.createTargetGroup.handle(command, options);
  }

  /** Handle a DescribeTargetGroups Command from the SDK. */
  async describeTargetGroups(
    command: elbV2.SimDescribeTargetGroupsCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimDescribeTargetGroupsCommandOutput> {
    return await this.commands.describeTargetGroups.handle(command, options);
  }

  /** Handle a ModifyTargetGroup Command from the SDK. */
  async modifyTargetGroup(
    command: elbV2.SimModifyTargetGroupCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimModifyTargetGroupCommandOutput> {
    return await this.commands.modifyTargetGroup.handle(command, options);
  }

  /** Handle a DeleteTargetGroup Command from the SDK. */
  async deleteTargetGroup(
    command: elbV2.SimDeleteTargetGroupCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimDeleteTargetGroupCommandOutput> {
    return await this.commands.deleteTargetGroup.handle(command, options);
  }

  /** Handle a RegisterTargets Command from the SDK. */
  async registerTargets(
    command: elbV2.SimRegisterTargetsCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimRegisterTargetsCommandOutput> {
    return await this.commands.registerTargets.handle(command, options);
  }

  /** Handle a DeregisterTargets Command from the SDK. */
  async deregisterTargets(
    command: elbV2.SimDeregisterTargetsCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimDeregisterTargetsCommandOutput> {
    return await this.commands.deregisterTargets.handle(command, options);
  }

  /** Handle a DescribeTargetHealth Command from the SDK. */
  async describeTargetHealth(
    command: elbV2.SimDescribeTargetHealthCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimDescribeTargetHealthCommandOutput> {
    return await this.commands.describeTargetHealth.handle(command, options);
  }

  /** Handle a CreateListener Command from the SDK. */
  async createListener(
    command: elbV2.SimCreateListenerCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimCreateListenerCommandOutput> {
    return await this.commands.createListener.handle(command, options);
  }

  /** Handle a DescribeListeners Command from the SDK. */
  async describeListeners(
    command: elbV2.SimDescribeListenersCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimDescribeListenersCommandOutput> {
    return await this.commands.describeListeners.handle(command, options);
  }

  /** Handle a ModifyListener Command from the SDK. */
  async modifyListener(
    command: elbV2.SimModifyListenerCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimModifyListenerCommandOutput> {
    return await this.commands.modifyListener.handle(command, options);
  }

  /** Handle a DeleteListener Command from the SDK. */
  async deleteListener(
    command: elbV2.SimDeleteListenerCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimDeleteListenerCommandOutput> {
    return await this.commands.deleteListener.handle(command, options);
  }

  /** Handle an AddListenerCertificates Command from the SDK. */
  async addListenerCertificates(
    command: elbV2.SimAddListenerCertificatesCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimAddListenerCertificatesCommandOutput> {
    return await this.commands.addListenerCertificates.handle(command, options);
  }

  /** Handle a RemoveListenerCertificates Command from the SDK. */
  async removeListenerCertificates(
    command: elbV2.SimRemoveListenerCertificatesCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimRemoveListenerCertificatesCommandOutput> {
    return await this.commands.removeListenerCertificates.handle(
      command,
      options,
    );
  }

  /** Handle a DescribeListenerCertificates Command from the SDK. */
  async describeListenerCertificates(
    command: elbV2.SimDescribeListenerCertificatesCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimDescribeListenerCertificatesCommandOutput> {
    return await this.commands.describeListenerCertificates.handle(
      command,
      options,
    );
  }

  /** Handle a CreateRule Command from the SDK. */
  async createRule(
    command: elbV2.SimCreateRuleCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimCreateRuleCommandOutput> {
    return await this.commands.createRule.handle(command, options);
  }

  /** Handle a DescribeRules Command from the SDK. */
  async describeRules(
    command: elbV2.SimDescribeRulesCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimDescribeRulesCommandOutput> {
    return await this.commands.describeRules.handle(command, options);
  }

  /** Handle a ModifyRule Command from the SDK. */
  async modifyRule(
    command: elbV2.SimModifyRuleCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimModifyRuleCommandOutput> {
    return await this.commands.modifyRule.handle(command, options);
  }

  /** Handle a DeleteRule Command from the SDK. */
  async deleteRule(
    command: elbV2.SimDeleteRuleCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimDeleteRuleCommandOutput> {
    return await this.commands.deleteRule.handle(command, options);
  }

  /** Handle a SetRulePriorities Command from the SDK. */
  async setRulePriorities(
    command: elbV2.SimSetRulePrioritiesCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<elbV2.SimSetRulePrioritiesCommandOutput> {
    return await this.commands.setRulePriorities.handle(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
