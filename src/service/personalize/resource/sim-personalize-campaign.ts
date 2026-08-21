import type { SimPersonalizeResource } from "./sim-personalize-resource.js";

export interface SimPersonalizeCampaignProperties {
  readonly arn: string;
  readonly name: string;
  readonly status: string;
  readonly creationDateTime: Date;
  readonly solutionVersionArn: string;
  readonly minProvisionedTPS?: number | undefined;
}

/**
 * A simulated Personalize campaign: the endpoint a runtime call names.
 *
 * This is the resource the whole custom chain exists to reach, and the one no
 * CloudFormation template can declare. Real Personalize has no
 * `AWS::Personalize::Campaign` type, so a campaign is always created through
 * the SDK, the CLI or the console.
 */
export class SimPersonalizeCampaign implements SimPersonalizeResource {
  public readonly arn: string;
  public readonly name: string;
  public readonly status: string;
  public readonly creationDateTime: Date;
  public readonly lastUpdatedDateTime: Date;
  public readonly solutionVersionArn: string;
  public readonly minProvisionedTPS: number;

  constructor(properties: SimPersonalizeCampaignProperties) {
    this.arn = properties.arn;
    this.name = properties.name;
    this.status = properties.status;
    this.creationDateTime = properties.creationDateTime;
    this.lastUpdatedDateTime = properties.creationDateTime;
    this.solutionVersionArn = properties.solutionVersionArn;
    this.minProvisionedTPS = properties.minProvisionedTPS ?? 1;
  }
}
