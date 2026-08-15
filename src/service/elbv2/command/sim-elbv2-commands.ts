import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAcmRegistry } from "../../acm/registry/sim-acm-registry.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimElbV2ActionTargets } from "../action/sim-elbv2-action-targets.js";
import { SimElbV2CertificateResolver } from "../listener/certificate/sim-elbv2-certificate-resolver.js";
import type { SimElbV2Stores } from "../sim-elbv2-stores.js";
import { SimElbV2TargetGroupUsage } from "../target-group/sim-elbv2-target-group-usage.js";
import { SimElbV2Authorizer } from "./authorize/sim-elbv2-authorizer.js";
import { AddListenerCertificatesCommandHandler } from "./listener-certificate/add-listener-certificates.handler.js";
import { DescribeListenerCertificatesCommandHandler } from "./listener-certificate/describe-listener-certificates.handler.js";
import { RemoveListenerCertificatesCommandHandler } from "./listener-certificate/remove-listener-certificates.handler.js";
import { CreateListenerCommandHandler } from "./listener/create-listener.handler.js";
import { DeleteListenerCommandHandler } from "./listener/delete-listener.handler.js";
import { DescribeListenersCommandHandler } from "./listener/describe-listeners.handler.js";
import { ModifyListenerCommandHandler } from "./listener/modify-listener.handler.js";
import { CreateLoadBalancerCommandHandler } from "./load-balancer/create-load-balancer.handler.js";
import { DeleteLoadBalancerCommandHandler } from "./load-balancer/delete-load-balancer.handler.js";
import { DescribeLoadBalancersCommandHandler } from "./load-balancer/describe-load-balancers.handler.js";
import { CreateRuleCommandHandler } from "./rule/create-rule.handler.js";
import { DeleteRuleCommandHandler } from "./rule/delete-rule.handler.js";
import { DescribeRulesCommandHandler } from "./rule/describe-rules.handler.js";
import { ModifyRuleCommandHandler } from "./rule/modify-rule.handler.js";
import { SetRulePrioritiesCommandHandler } from "./rule/set-rule-priorities.handler.js";
import { CreateTargetGroupCommandHandler } from "./target-group/create-target-group.handler.js";
import { DeleteTargetGroupCommandHandler } from "./target-group/delete-target-group.handler.js";
import { DescribeTargetGroupsCommandHandler } from "./target-group/describe-target-groups.handler.js";
import { ModifyTargetGroupCommandHandler } from "./target-group/modify-target-group.handler.js";
import { DeregisterTargetsCommandHandler } from "./target/deregister-targets.handler.js";
import { DescribeTargetHealthCommandHandler } from "./target/describe-target-health.handler.js";
import { RegisterTargetsCommandHandler } from "./target/register-targets.handler.js";

interface SimElbV2CommandsProperties {
  readonly stores: SimElbV2Stores;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly acmRegistry?: SimAcmRegistry | undefined;
}

/**
 * The command handlers of one simulated ELBv2 scope.
 *
 * Building them lives here rather than in the facade so that the facade stays
 * a list of delegations: adding an operation is a handler here and a method
 * there, and the wiring every handler shares is stated once.
 */
export class SimElbV2Commands {
  public readonly createLoadBalancer: CreateLoadBalancerCommandHandler;
  public readonly describeLoadBalancers: DescribeLoadBalancersCommandHandler;
  public readonly deleteLoadBalancer: DeleteLoadBalancerCommandHandler;
  public readonly createTargetGroup: CreateTargetGroupCommandHandler;
  public readonly describeTargetGroups: DescribeTargetGroupsCommandHandler;
  public readonly modifyTargetGroup: ModifyTargetGroupCommandHandler;
  public readonly deleteTargetGroup: DeleteTargetGroupCommandHandler;
  public readonly registerTargets: RegisterTargetsCommandHandler;
  public readonly deregisterTargets: DeregisterTargetsCommandHandler;
  public readonly describeTargetHealth: DescribeTargetHealthCommandHandler;
  public readonly createListener: CreateListenerCommandHandler;
  public readonly describeListeners: DescribeListenersCommandHandler;
  public readonly modifyListener: ModifyListenerCommandHandler;
  public readonly deleteListener: DeleteListenerCommandHandler;
  public readonly createRule: CreateRuleCommandHandler;
  public readonly describeRules: DescribeRulesCommandHandler;
  public readonly modifyRule: ModifyRuleCommandHandler;
  public readonly deleteRule: DeleteRuleCommandHandler;
  public readonly setRulePriorities: SetRulePrioritiesCommandHandler;
  public readonly addListenerCertificates: AddListenerCertificatesCommandHandler;
  public readonly removeListenerCertificates: RemoveListenerCertificatesCommandHandler;
  public readonly describeListenerCertificates: DescribeListenerCertificatesCommandHandler;

  constructor(properties: SimElbV2CommandsProperties) {
    const { stores, background, accountRegionScope } = properties;
    const authorizer = new SimElbV2Authorizer({ iam: properties.iam });
    const usage = new SimElbV2TargetGroupUsage(stores);
    const actionTargets = new SimElbV2ActionTargets(stores.targetGroups);
    const certificates = new SimElbV2CertificateResolver({
      accountRegionScope,
      acmRegistry: properties.acmRegistry,
    });
    const shared = { stores, authorizer, background };
    const withTargets = { ...shared, actionTargets, certificates };
    const withCertificates = { ...shared, certificates };
    const withUsage = { ...shared, usage };

    this.createLoadBalancer = new CreateLoadBalancerCommandHandler({
      ...shared,
      accountRegionScope,
    });
    this.describeLoadBalancers = new DescribeLoadBalancersCommandHandler(
      shared,
    );
    this.deleteLoadBalancer = new DeleteLoadBalancerCommandHandler(shared);
    this.createTargetGroup = new CreateTargetGroupCommandHandler({
      ...withUsage,
      accountRegionScope,
    });
    this.describeTargetGroups = new DescribeTargetGroupsCommandHandler(
      withUsage,
    );
    this.modifyTargetGroup = new ModifyTargetGroupCommandHandler(withUsage);
    this.deleteTargetGroup = new DeleteTargetGroupCommandHandler(withUsage);
    this.registerTargets = new RegisterTargetsCommandHandler(shared);
    this.deregisterTargets = new DeregisterTargetsCommandHandler(shared);
    this.describeTargetHealth = new DescribeTargetHealthCommandHandler(shared);
    this.createListener = new CreateListenerCommandHandler(withTargets);
    this.describeListeners = new DescribeListenersCommandHandler(shared);
    this.modifyListener = new ModifyListenerCommandHandler(withTargets);
    this.deleteListener = new DeleteListenerCommandHandler(shared);
    this.createRule = new CreateRuleCommandHandler(withTargets);
    this.describeRules = new DescribeRulesCommandHandler(shared);
    this.modifyRule = new ModifyRuleCommandHandler(withTargets);
    this.deleteRule = new DeleteRuleCommandHandler(shared);
    this.setRulePriorities = new SetRulePrioritiesCommandHandler(shared);
    this.addListenerCertificates = new AddListenerCertificatesCommandHandler(
      withCertificates,
    );
    this.removeListenerCertificates =
      new RemoveListenerCertificatesCommandHandler(shared);
    this.describeListenerCertificates =
      new DescribeListenerCertificatesCommandHandler(shared);
  }
}
