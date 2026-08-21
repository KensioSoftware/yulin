import type { SimPersonalizeResource } from "./sim-personalize-resource.js";

export interface SimPersonalizeSolutionProperties {
  readonly arn: string;
  readonly name: string;
  readonly status: string;
  readonly creationDateTime: Date;
  readonly datasetGroupArn: string;
  readonly recipeArn?: string | undefined;
  readonly eventType?: string | undefined;
  readonly performAutoML?: boolean | undefined;
  readonly performHPO?: boolean | undefined;
}

/**
 * A simulated Personalize solution: a recipe chosen against a dataset group.
 *
 * The recipe ARN is recorded and never looked up. Simulated Personalize has no
 * catalogue of recipes and trains nothing, so one recipe is as good as another
 * here. The recipe starts mattering with domain recommenders, where the use
 * case it names decides which parameters a recommendation request has to
 * carry.
 */
export class SimPersonalizeSolution implements SimPersonalizeResource {
  public readonly arn: string;
  public readonly name: string;
  public readonly status: string;
  public readonly creationDateTime: Date;
  public readonly lastUpdatedDateTime: Date;
  public readonly datasetGroupArn: string;
  public readonly recipeArn: string | undefined;
  public readonly eventType: string | undefined;
  public readonly performAutoML: boolean;
  public readonly performHPO: boolean;

  constructor(properties: SimPersonalizeSolutionProperties) {
    this.arn = properties.arn;
    this.name = properties.name;
    this.status = properties.status;
    this.creationDateTime = properties.creationDateTime;
    this.lastUpdatedDateTime = properties.creationDateTime;
    this.datasetGroupArn = properties.datasetGroupArn;
    this.recipeArn = properties.recipeArn;
    this.eventType = properties.eventType;
    this.performAutoML = properties.performAutoML ?? false;
    this.performHPO = properties.performHPO ?? false;
  }
}
