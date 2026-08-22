import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimHttpApiStage } from "../../api/stage/sim-http-api-stage.js";
import { SimApiGatewayV2NotFound } from "../../error/sim-api-gateway-v2.error.js";
import type { SimApiGatewayV2RequestOptions } from "../sim-api-gateway-v2-request-options.js";
import { SimApiGatewayV2UnsimulatedInput } from "../sim-api-gateway-v2-unsimulated-input.js";
import type { SimHttpApiAccess } from "../sim-http-api-access.js";
import { simHttpApiStageRouteSettings } from "./sim-http-api-stage-route-settings-input.js";
import { SimHttpApiStageRules } from "./sim-http-api-stage-rules.js";
import type {
  SimCreateStageCommand,
  SimCreateStageCommandOutput,
  SimDeleteStageCommand,
  SimDeleteStageCommandOutput,
  SimGetStagesCommand,
  SimGetStagesCommandOutput,
} from "./stage.command.js";

const stagesPath = "/stages";

const acceptedCreateStageOptions = [
  "ApiId",
  "StageName",
  "AutoDeploy",
  "StageVariables",
  "Description",
  "DefaultRouteSettings",
  "RouteSettings",
];

interface SimHttpApiStageCommandsProperties {
  readonly access: SimHttpApiAccess;
  readonly clock: SimClock;
}

/**
 * The commands addressing the stages of an API.
 */
export class SimHttpApiStageCommands {
  private readonly access: SimHttpApiAccess;
  private readonly clock: SimClock;
  private readonly rules = new SimHttpApiStageRules();

  constructor(properties: SimHttpApiStageCommandsProperties) {
    this.access = properties.access;
    this.clock = properties.clock;
  }

  /**
   * Handle a CreateStage command.
   */
  createStage(
    command: SimCreateStageCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimCreateStageCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("CreateStage");
    unsimulated.refuseUnaccepted(input, acceptedCreateStageOptions);
    const apiId = unsimulated.require("ApiId", input.ApiId);
    const stageName = this.rules.requireStageName(
      unsimulated.require("StageName", input.StageName),
    );
    this.rules.requireAutoDeploy(input.AutoDeploy);
    const routeSettings = simHttpApiStageRouteSettings(input, {
      unsimulated,
      clock: this.clock,
    });

    const httpApi = this.access.api({
      method: "POST",
      apiId,
      childPath: stagesPath,
      caller: options?.caller,
    });
    this.rules.requireUnusedStageName(httpApi, stageName);

    const stage = new SimHttpApiStage({
      stageName,
      autoDeploy: true,
      stageVariables: input.StageVariables,
      description: input.Description,
      createdDate: this.clock.now(),
      routeSettings,
    });
    httpApi.stages.add(stage);

    return { ...stage.view(), $metadata: {} };
  }

  /**
   * Handle a GetStages command.
   */
  getStages(
    command: SimGetStagesCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimGetStagesCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("GetStages");
    unsimulated.refusePaging(command.input);
    unsimulated.refuseUnaccepted(command.input, ["ApiId"]);
    const apiId = unsimulated.require("ApiId", command.input.ApiId);

    const httpApi = this.access.api({
      method: "GET",
      apiId,
      childPath: stagesPath,
      caller: options?.caller,
    });

    return {
      Items: httpApi.stages.list().map((stage) => stage.view()),
      $metadata: {},
    };
  }

  /**
   * Handle a DeleteStage command.
   *
   * The stage stops serving, so a request addressed to it resolves to nothing.
   * The API's routes stay, since they belong to the API rather than to the
   * stage, and another stage of the same API still serves them.
   */
  deleteStage(
    command: SimDeleteStageCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimDeleteStageCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("DeleteStage");
    unsimulated.refuseUnaccepted(command.input, ["ApiId", "StageName"]);
    const apiId = unsimulated.require("ApiId", command.input.ApiId);
    const stageName = unsimulated.require("StageName", command.input.StageName);

    const httpApi = this.access.api({
      method: "DELETE",
      apiId,
      childPath: `${stagesPath}/${stageName}`,
      caller: options?.caller,
    });
    const stage = httpApi.stages.find(stageName);

    if (stage === undefined) {
      throw new SimApiGatewayV2NotFound(
        `No stage named ${stageName} on API ${apiId}`,
      );
    }

    httpApi.stages.remove(stage.stageName);

    return { $metadata: {} };
  }
}
