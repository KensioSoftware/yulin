import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { validateSimElbV2LoadBalancerRequest } from "./create-load-balancer-validator.js";
import { simElbV2LoadBalancerName } from "../../load-balancer/sim-elbv2-load-balancer-name.js";
import { simElbV2LoadBalancerScheme } from "../../load-balancer/sim-elbv2-load-balancer-scheme.js";
import { SimElbV2LoadBalancer } from "../../load-balancer/sim-elbv2-load-balancer.js";
import {
  simElbV2DnsSuffix,
  simElbV2ResourceId,
} from "../../sim-elbv2-resource-id.js";
import {
  SimElbV2CommandHandler,
  type SimElbV2CommandHandlerProperties,
} from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimCreateLoadBalancerCommand,
  SimCreateLoadBalancerCommandOutput,
} from "./load-balancer.command.js";

interface CreateLoadBalancerCommandHandlerProperties extends SimElbV2CommandHandlerProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Simulated ELBv2 CreateLoadBalancerCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateLoadBalancer.html
 */
export class CreateLoadBalancerCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<
      SimCreateLoadBalancerCommand,
      SimCreateLoadBalancerCommandOutput
    >
{
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: CreateLoadBalancerCommandHandlerProperties) {
    super(properties);
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Create an Application Load Balancer and report the DNS name it answers on.
   *
   * The name is checked before authorization so a malformed request stays a
   * client error, as it is on real ELB, and nothing is stored before the
   * caller has been allowed to store it.
   */
  async handle(
    command: SimCreateLoadBalancerCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimCreateLoadBalancerCommandOutput> {
    const { input } = command;

    validateSimElbV2LoadBalancerRequest(input);

    const name = simElbV2LoadBalancerName(input.Name);
    const scheme = simElbV2LoadBalancerScheme(input.Scheme);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorizeAnyResource("CreateLoadBalancer", options);

    this.stores.loadBalancers.requireNameAvailable(name);

    const sequence = this.stores.loadBalancers.nextSequence();
    const loadBalancer = new SimElbV2LoadBalancer({
      name,
      scheme,
      ipAddressType: input.IpAddressType ?? "ipv4",
      id: simElbV2ResourceId(sequence),
      dnsSuffix: simElbV2DnsSuffix(sequence),
      createdTime: this.background.now(),
      accountRegionScope: this.accountRegionScope,
    });

    this.stores.loadBalancers.put(loadBalancer);

    return { $metadata: {}, LoadBalancers: [loadBalancer.view()] };
  }
}
