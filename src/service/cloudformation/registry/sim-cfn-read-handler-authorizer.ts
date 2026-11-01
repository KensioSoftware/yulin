import { SimIamActionAuthorizer } from "../../iam/authorize/sim-iam-action-authorizer.js";
import { simScopeIamAuthZ } from "../../iam/authorize/sim-iam-region-auth-z.js";
import type { SimCfnResource } from "../resource/sim-cfn-resource.js";
import type { SimCfnStackDeployContext } from "../stack/sim-cfn-stack-deploy-context.js";
import type { SimCfnStackUpdatePlan } from "../stack/update/sim-cfn-stack-update-plan.js";
import type { SimCfnTemplate } from "../template/sim-cfn-template.js";
import { simCfnReadHandler } from "./sim-cfn-read-handlers.js";
import { SimCfnResourceArn } from "./sim-cfn-resource-arn.js";

interface SimCfnReadHandlerAuthorizerProperties {
  /**
   * Where the simulation and the Stack's caller are read from. The caller is
   * read when the update authorizes, because an update naming a caller of its
   * own takes it on after this is made.
   */
  readonly context: SimCfnStackDeployContext;
}

/**
 * Authorizes the calls CloudFormation's read handlers make as the deployment's
 * caller.
 *
 * Real CloudFormation calls a Resource's read handler when it needs the
 * Resource's attributes and holds no fresh model of it. A Stack update that
 * leaves a Resource alone, while the new template reads one of its attributes
 * through `Fn::GetAtt`, is the case simulated here. The handler runs as the
 * Stack's execution role, so a role missing one of its calls fails the update.
 *
 * This needs no model of the Resource's service. A Resource type yulin skips
 * is authorized the same way as one it creates, from the registry snapshot
 * and the Resource's properties.
 */
export class SimCfnReadHandlerAuthorizer {
  private readonly context: SimCfnStackDeployContext;

  constructor(properties: SimCfnReadHandlerAuthorizerProperties) {
    this.context = properties.context;
  }

  /**
   * Ensure the caller may make the read handler calls of each Resource an
   * update leaves alone while its new template reads the Resource's
   * attributes.
   */
  async authorizeUpdate(
    plan: SimCfnStackUpdatePlan,
    update: {
      readonly updated: SimCfnTemplate;
      readonly resources: ReadonlyMap<string, SimCfnResource>;
    },
  ): Promise<void> {
    await this.authorize(
      plan.untouchedReadBy(update.updated.template),
      update.resources,
    );
  }

  /**
   * Ensure the caller may make every call each Resource's read handler makes.
   */
  async authorize(
    reading: readonly SimCfnResource[],
    resources: ReadonlyMap<string, SimCfnResource>,
  ): Promise<void> {
    await Promise.all(
      reading.map(async (resource) => {
        await this.authorizeOne(resource, resources);
      }),
    );
  }

  private async authorizeOne(
    resource: SimCfnResource,
    resources: ReadonlyMap<string, SimCfnResource>,
  ): Promise<void> {
    const handler = simCfnReadHandler(resource.type ?? "");

    if (handler === undefined) {
      return;
    }

    const { simAws, caller } = this.context;
    const resolvedProperties = await resource.resolvedProperties({
      resources,
      simAws,
      caller,
    });
    const resourceArn = new SimCfnResourceArn({
      resource,
      arnFormat: handler.arnFormat,
      resolvedProperties,
    }).value();
    const { accountId, regionName } = resource.accountRegionScope;
    const authorizer = new SimIamActionAuthorizer({
      iam: simScopeIamAuthZ(simAws.accountRegionScope(accountId, regionName)),
    });

    // The denial keeps its AccessDenied name, as a failed creation's does, so a
    // test can match it the way it matches any other refusal.
    try {
      handler.authorize(authorizer, resourceArn, caller);
    } catch (error) {
      if (error instanceof Error) {
        error.message = `Sim CloudFormation Resource ${resource.logicalId} read handler failed: ${error.message}`;
      }

      throw error;
    }
  }
}
