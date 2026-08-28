import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimPersonalizeResources } from "../resource/sim-personalize-resources.js";
import type { SimPersonalizeSolution } from "../resource/sim-personalize-solution.js";
import type { SimPersonalize } from "../sim-personalize.js";
import { simCfnPersonalizeCreated } from "./sim-cfn-personalize-created.js";
import { SimCfnPersonalizeProperties } from "./sim-cfn-personalize-properties.js";
import { simCfnPersonalizeResourceCreation } from "./sim-cfn-personalize-resource-error.js";
import { personalizeSolutionResourceType } from "./sim-cfn-personalize-resource-types.js";
import type { SimCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

const readProperties = new Set([
  "Name",
  "DatasetGroupArn",
  "RecipeArn",
  "EventType",
  "PerformAutoML",
  "PerformHPO",
]);

const unreadProperties = new Map([
  [
    "SolutionConfig",
    "solution configuration tunes a training run, and simulated Personalize " +
      "fits no model",
  ],
]);

interface SimCfnPersonalizeSolutionCreatorProperties {
  readonly personalize: SimPersonalize;
  readonly resources: SimPersonalizeResources;
}

/**
 * Creates simulated solutions from AWS::Personalize::Solution Resources.
 *
 * A solution is as far as a template reaches. CloudFormation has no
 * `AWS::Personalize::SolutionVersion` type and no `AWS::Personalize::Campaign`
 * type, so training and the endpoint that serves recommendations are always
 * done outside the stack.
 */
export class SimCfnPersonalizeSolutionCreator {
  readonly #personalize: SimPersonalize;
  readonly #resources: SimPersonalizeResources;

  constructor(properties: SimCfnPersonalizeSolutionCreatorProperties) {
    this.#personalize = properties.personalize;
    this.#resources = properties.resources;
  }

  /** Create a solution from an AWS::Personalize::Solution Resource. */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimPersonalizeSolution> {
    const read = new SimCfnPersonalizeProperties({
      resourceType: personalizeSolutionResourceType,
      resource,
      properties,
      read: readProperties,
      unread: unreadProperties,
    });
    const input = {
      name: read.string("Name"),
      datasetGroupArn: read.string("DatasetGroupArn"),
      recipeArn: read.string("RecipeArn"),
      eventType: read.string("EventType"),
      performAutoML: read.boolean("PerformAutoML"),
      performHPO: read.boolean("PerformHPO"),
    };

    read.recordUnreadProperties();

    return await simCfnPersonalizeResourceCreation(
      personalizeSolutionResourceType,
      resource.logicalId,
      async () => {
        const created = await this.#personalize.createSolution(
          { input },
          options,
        );

        return simCfnPersonalizeCreated(
          this.#resources.solutions,
          created.solutionArn,
          "solution",
        );
      },
    );
  }

  /** Delete a solution an AWS::Personalize::Solution Resource made. */
  async delete(
    solution: SimPersonalizeSolution,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await this.#personalize.deleteSolution(
      { input: { solutionArn: solution.arn } },
      options,
    );
  }
}
