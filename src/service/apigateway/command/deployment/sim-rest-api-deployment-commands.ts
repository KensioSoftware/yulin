import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  makeSimRestApiDeploymentId,
  SimRestApiDeployment,
} from "../../api/deployment/sim-rest-api-deployment.js";
import type { SimApiGatewayRequestOptions } from "../sim-api-gateway-request-options.js";
import { SimApiGatewayUnsimulatedInput } from "../sim-api-gateway-unsimulated-input.js";
import type { SimRestApiAccess } from "../sim-rest-api-access.js";
import { SimRestApiStagePublisher } from "../stage/sim-rest-api-stage-publisher.js";
import type {
  SimCreateDeploymentCommand,
  SimCreateDeploymentCommandOutput,
} from "../stage/stage.command.js";

const deploymentsPath = "/deployments";

const acceptedCreateOptions = [
  "restApiId",
  "stageName",
  "description",
  "stageDescription",
  "variables",
];

interface SimRestApiDeploymentCommandsProperties {
  readonly access: SimRestApiAccess;
  readonly clock: SimClock;
}

/**
 * The commands addressing the deployments of a REST API.
 */
export class SimRestApiDeploymentCommands {
  private readonly access: SimRestApiAccess;
  private readonly clock: SimClock;
  private readonly publisher: SimRestApiStagePublisher;

  constructor(properties: SimRestApiDeploymentCommandsProperties) {
    this.access = properties.access;
    this.clock = properties.clock;
    this.publisher = new SimRestApiStagePublisher({ clock: properties.clock });
  }

  /**
   * Handle a CreateDeployment command.
   *
   * A `stageName` publishes the deployment to a new stage of that name, which
   * is the one-call form. Left out, the deployment is created and nothing
   * serves it until a stage points at it.
   */
  createDeployment(
    command: SimCreateDeploymentCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimCreateDeploymentCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayUnsimulatedInput("CreateDeployment");
    unsimulated.refuseUnaccepted(input, acceptedCreateOptions);
    const restApiId = unsimulated.require("restApiId", input.restApiId);

    const restApi = this.access.api({
      method: "POST",
      restApiId,
      childPath: deploymentsPath,
      caller: options?.caller,
    });

    const deployment = new SimRestApiDeployment({
      deploymentId: makeSimRestApiDeploymentId(),
      createdDate: this.clock.now(),
      description: input.description,
    });
    restApi.deployments.add(deployment);
    this.publishStage(restApi, deployment.deploymentId, input);

    return { ...deployment.view(), $metadata: {} };
  }

  /**
   * Publish the deployment to the stage the request named, where it named one.
   */
  private publishStage(
    restApi: Parameters<SimRestApiStagePublisher["publish"]>[0],
    deploymentId: SimRestApiDeployment["deploymentId"],
    input: SimCreateDeploymentCommand["input"],
  ): void {
    const { stageName } = input;

    if (stageName === undefined) {
      return;
    }

    this.publisher.publish(restApi, {
      stageName,
      deploymentId,
      description: input.stageDescription,
      variables: input.variables,
    });
  }
}
