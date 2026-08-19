import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimApiGatewayRequestOptions } from "../sim-api-gateway-request-options.js";
import { SimApiGatewayUnsimulatedInput } from "../sim-api-gateway-unsimulated-input.js";
import type { SimRestApiAccess } from "../sim-rest-api-access.js";
import { SimRestApiStagePublisher } from "./sim-rest-api-stage-publisher.js";
import { SimRestApiStageRules } from "./sim-rest-api-stage-rules.js";
import type {
  SimCreateStageCommand,
  SimCreateStageCommandOutput,
  SimDeleteStageCommand,
  SimDeleteStageCommandOutput,
  SimGetStageCommand,
  SimGetStageCommandOutput,
  SimGetStagesCommand,
  SimGetStagesCommandOutput,
} from "./stage.command.js";

const stagesPath = "/stages";

const acceptedCreateOptions = [
  "restApiId",
  "stageName",
  "deploymentId",
  "description",
  "variables",
];

interface SimRestApiStageCommandsProperties {
  readonly access: SimRestApiAccess;
  readonly clock: SimClock;
}

/**
 * The commands addressing the stages of a REST API.
 *
 * A REST API is reachable once a stage exists, and every stage is a path
 * segment of the endpoint.
 */
export class SimRestApiStageCommands {
  private readonly access: SimRestApiAccess;
  private readonly publisher: SimRestApiStagePublisher;
  private readonly rules = new SimRestApiStageRules();

  constructor(properties: SimRestApiStageCommandsProperties) {
    this.access = properties.access;
    this.publisher = new SimRestApiStagePublisher({ clock: properties.clock });
  }

  /**
   * Handle a CreateStage command.
   */
  createStage(
    command: SimCreateStageCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimCreateStageCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayUnsimulatedInput("CreateStage");
    unsimulated.refuseUnaccepted(input, acceptedCreateOptions);
    const restApiId = unsimulated.require("restApiId", input.restApiId);
    const stageName = unsimulated.require("stageName", input.stageName);
    const named = unsimulated.require("deploymentId", input.deploymentId);

    const restApi = this.access.api({
      method: "POST",
      restApiId,
      childPath: stagesPath,
      caller: options?.caller,
    });
    const deploymentId = this.rules.requireDeployment(restApi, named);
    const stage = this.publisher.publish(restApi, {
      stageName,
      deploymentId,
      description: input.description,
      variables: input.variables,
    });

    return { ...stage.view(), $metadata: {} };
  }

  /**
   * Handle a GetStage command.
   */
  getStage(
    command: SimGetStageCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimGetStageCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayUnsimulatedInput("GetStage");
    unsimulated.refuseUnaccepted(input, ["restApiId", "stageName"]);
    const restApiId = unsimulated.require("restApiId", input.restApiId);
    const stageName = unsimulated.require("stageName", input.stageName);

    const restApi = this.access.api({
      method: "GET",
      restApiId,
      childPath: `${stagesPath}/${stageName}`,
      caller: options?.caller,
    });

    return {
      ...this.rules.requireStage(restApi, stageName).view(),
      $metadata: {},
    };
  }

  /**
   * Handle a GetStages command.
   */
  getStages(
    command: SimGetStagesCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimGetStagesCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayUnsimulatedInput("GetStages");
    unsimulated.refuseUnaccepted(input, ["restApiId", "deploymentId"]);
    const restApiId = unsimulated.require("restApiId", input.restApiId);

    const restApi = this.access.api({
      method: "GET",
      restApiId,
      childPath: stagesPath,
      caller: options?.caller,
    });
    const stages = this.rules.stagesOfDeployment(restApi, input.deploymentId);

    return { item: stages.map((stage) => stage.view()), $metadata: {} };
  }

  /**
   * Handle a DeleteStage command.
   *
   * The stage stops serving, and a request addressed to it reaches nothing.
   * The API's resources and methods stay, because they belong to the API, and
   * another stage still serves them.
   */
  deleteStage(
    command: SimDeleteStageCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimDeleteStageCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayUnsimulatedInput("DeleteStage");
    unsimulated.refuseUnaccepted(input, ["restApiId", "stageName"]);
    const restApiId = unsimulated.require("restApiId", input.restApiId);
    const stageName = unsimulated.require("stageName", input.stageName);

    const restApi = this.access.api({
      method: "DELETE",
      restApiId,
      childPath: `${stagesPath}/${stageName}`,
      caller: options?.caller,
    });
    this.rules.requireStage(restApi, stageName);
    restApi.stages.remove(stageName);

    return { $metadata: {} };
  }
}
