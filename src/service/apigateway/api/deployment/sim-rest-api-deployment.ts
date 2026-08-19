import { faker } from "@faker-js/faker";

import type { Brand } from "../../../../util/brand.type.js";

/**
 * The id API Gateway allocates for one deployment of a REST API.
 */
export type SimRestApiDeploymentId = Brand<string, "SimRestApiDeploymentId">;

/**
 * Allocate a deployment id, in the opaque short lowercase alphanumeric shape
 * real API Gateway uses.
 */
export function makeSimRestApiDeploymentId(): SimRestApiDeploymentId {
  return faker.helpers.fromRegExp(/[a-z0-9]{6}/) as SimRestApiDeploymentId;
}

interface SimRestApiDeploymentProperties {
  readonly deploymentId: SimRestApiDeploymentId;
  readonly createdDate: Date;
  readonly description?: string | undefined;
}

/**
 * Minimal structural deployment view, as CreateDeployment returns.
 */
export interface SimRestApiDeploymentView {
  id: string;
  createdDate: Date;
  description?: string;
}

/**
 * A simulated REST API deployment: a snapshot a stage points at.
 *
 * Real API Gateway freezes the resources and methods into the deployment, and
 * an edit made afterwards reaches no client until another deployment is
 * created. Here a deployment records that one was made and when. A stage
 * serves the API's current resources, so a test editing a method sees the
 * change without redeploying, which is the one place this departs from AWS.
 */
export class SimRestApiDeployment {
  public readonly deploymentId: SimRestApiDeploymentId;
  public readonly createdDate: Date;
  public readonly description?: string | undefined;

  constructor(properties: SimRestApiDeploymentProperties) {
    this.deploymentId = properties.deploymentId;
    this.createdDate = properties.createdDate;
    this.description = properties.description;
  }

  /**
   * Get the AWS-like view of this deployment.
   */
  view(): SimRestApiDeploymentView {
    const view: SimRestApiDeploymentView = {
      id: this.deploymentId,
      createdDate: new Date(this.createdDate),
    };

    if (this.description !== undefined) {
      view.description = this.description;
    }

    return view;
  }
}
