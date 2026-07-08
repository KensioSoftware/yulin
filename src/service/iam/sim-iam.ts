import type { SimArn } from "../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { CreatePolicyCommandHandler } from "./command/create-policy/create-policy.handler.js";
import type {
  SimCreatePolicyCommand,
  SimCreatePolicyCommandOutput,
} from "./command/create-policy/create-policy.cmd.js";
import type { SimIamPolicy } from "./policy/sim-iam-policy.js";
import { GetPolicyCommandHandler } from "./command/get-policy/get-policy.handler.js";
import type {
  SimGetPolicyCommand,
  SimGetPolicyCommandOutput,
} from "./command/get-policy/get-policy.cmd.js";
import type {
  SimListPoliciesCommand,
  SimListPoliciesCommandOutput,
} from "./command/list-policies/list-policies.cmd.js";
import { ListPoliciesCommandHandler } from "./command/list-policies/list-policies.handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import { SimIamRegistry } from "./registry/sim-iam-registry.js";

interface SimIamProps {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly background?: BackgroundScheduler;
  readonly iamRegistry?: SimIamRegistry;
}

/**
 * Simulated IAM. Handles SDK commands. Emulates AWS behaviour and state.
 *
 * IAM is account-scoped in AWS. Yulin constructs it from an Account/Region
 * scope for consistency with the other service factories, but memoises one
 * service facade per Account.
 */
export class SimIam {
  private readonly policies = new Map<SimArn, SimIamPolicy>();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly background: BackgroundScheduler;
  private readonly iamRegistry: SimIamRegistry;

  constructor(props: SimIamProps = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
      iamRegistry = new SimIamRegistry(),
    } = props;

    this.accountRegionScope = accountRegionScope;
    this.background = background;
    this.iamRegistry = iamRegistry;
  }

  /**
   * Handle a Create Policy Command from the SDK.
   */
  async createPolicy(
    cmd: SimCreatePolicyCommand,
  ): Promise<SimCreatePolicyCommandOutput> {
    this.iamRegistry.activate("IAM SDK API", "CreatePolicy");

    const handler = new CreatePolicyCommandHandler({
      accountId: this.accountRegionScope.accountId,
      policies: this.policies,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a Get Policy Command from the SDK.
   */
  async getPolicy(
    cmd: SimGetPolicyCommand,
  ): Promise<SimGetPolicyCommandOutput> {
    this.iamRegistry.activate("IAM SDK API", "GetPolicy");

    const handler = new GetPolicyCommandHandler({
      policies: this.policies,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a List Policies Command from the SDK.
   */
  async listPolicies(
    cmd: SimListPoliciesCommand,
  ): Promise<SimListPoliciesCommandOutput> {
    this.iamRegistry.activate("IAM SDK API", "ListPolicies");

    const handler = new ListPoliciesCommandHandler({
      policies: this.policies,
      background: this.background,
    });
    return await handler.handle(cmd);
  }
}
