import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimHttpApiStage } from "../../api/stage/sim-http-api-stage.js";
import type { SimApiGatewayV2RequestOptions } from "../sim-api-gateway-v2-request-options.js";
import { SimApiGatewayV2UnsimulatedInput } from "../sim-api-gateway-v2-unsimulated-input.js";
import type { SimHttpApiAccess } from "../sim-http-api-access.js";
import { SimHttpApiStageRules } from "./sim-http-api-stage-rules.js";
import type {
  SimCreateStageCommand,
  SimCreateStageCommandOutput,
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
}
