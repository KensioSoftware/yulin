import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimRestApiUserPools } from "../../api/authorizer/sim-rest-api-user-pools.js";
import type { SimWafProtection } from "../../../wafv2/association/sim-waf-protection.js";
import type { SimRestApiStore } from "../../api/sim-rest-api-store.js";
import { SimRestApi } from "../../api/sim-rest-api.js";
import type { SimRestApiRegistry } from "../../registry/sim-rest-api-registry.js";
import type { SimApiGatewayRequestOptions } from "../sim-api-gateway-request-options.js";
import { SimApiGatewayUnsimulatedInput } from "../sim-api-gateway-unsimulated-input.js";
import type { SimRestApiAccess } from "../sim-rest-api-access.js";
import { simRestApiPatchOf } from "./sim-rest-api-patch.js";
import type {
  SimCreateRestApiCommand,
  SimCreateRestApiCommandOutput,
  SimDeleteRestApiCommand,
  SimDeleteRestApiCommandOutput,
  SimGetRestApiCommand,
  SimGetRestApiCommandOutput,
  SimGetRestApisCommand,
  SimGetRestApisCommandOutput,
  SimUpdateRestApiCommand,
  SimUpdateRestApiCommandOutput,
} from "./rest-api.command.js";

const acceptedCreateOptions = [
  "name",
  "description",
  "disableExecuteApiEndpoint",
];

interface SimRestApiCommandsProperties {
  readonly apis: SimRestApiStore;
  readonly registry: SimRestApiRegistry;
  readonly access: SimRestApiAccess;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
  readonly userPools: SimRestApiUserPools;
  readonly webAcls: SimWafProtection;
}

/**
 * The commands addressing REST APIs themselves.
 */
export class SimRestApiCommands {
  private readonly apis: SimRestApiStore;
  private readonly registry: SimRestApiRegistry;
  private readonly access: SimRestApiAccess;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly clock: SimClock;
  private readonly userPools: SimRestApiUserPools;
  private readonly webAcls: SimWafProtection;

  constructor(properties: SimRestApiCommandsProperties) {
    this.apis = properties.apis;
    this.registry = properties.registry;
    this.access = properties.access;
    this.accountRegionScope = properties.accountRegionScope;
    this.clock = properties.clock;
    this.userPools = properties.userPools;
    this.webAcls = properties.webAcls;
  }

  /**
   * Handle a CreateRestApi command.
   *
   * The API is created with its root resource already there, which is what
   * real API Gateway does and what `rootResourceId` in the response names.
   */
  createRestApi(
    command: SimCreateRestApiCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimCreateRestApiCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayUnsimulatedInput("CreateRestApi");
    unsimulated.refuseUnaccepted(input, acceptedCreateOptions);
    const name = unsimulated.require("name", input.name);

    this.access.authorizeCollection("POST", options?.caller);

    const restApi = new SimRestApi({
      apiId: this.registry.allocateApiId(this.accountRegionScope.accountId),
      name,
      accountRegionScope: this.accountRegionScope,
      createdDate: this.clock.now(),
      userPools: this.userPools,
      webAcls: this.webAcls,
      description: input.description,
      disableExecuteApiEndpoint: input.disableExecuteApiEndpoint,
    });
    this.apis.add(restApi);

    return { ...restApi.view(), $metadata: {} };
  }

  /**
   * Handle a GetRestApi command.
   */
  getRestApi(
    command: SimGetRestApiCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimGetRestApiCommandOutput {
    const unsimulated = new SimApiGatewayUnsimulatedInput("GetRestApi");
    unsimulated.refuseUnaccepted(command.input, ["restApiId"]);
    const restApiId = unsimulated.require("restApiId", command.input.restApiId);

    const restApi = this.access.api({
      method: "GET",
      restApiId,
      caller: options?.caller,
    });

    return { ...restApi.view(), $metadata: {} };
  }

  /**
   * Handle a GetRestApis command.
   */
  getRestApis(
    command: SimGetRestApisCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimGetRestApisCommandOutput {
    const unsimulated = new SimApiGatewayUnsimulatedInput("GetRestApis");
    unsimulated.refusePaging(command.input);
    unsimulated.refuseUnaccepted(command.input, []);

    this.access.authorizeCollection("GET", options?.caller);

    return {
      items: this.apis.list().map((restApi) => restApi.view()),
      $metadata: {},
    };
  }

  /**
   * Handle an UpdateRestApi command.
   */
  updateRestApi(
    command: SimUpdateRestApiCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimUpdateRestApiCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayUnsimulatedInput("UpdateRestApi");
    unsimulated.refuseUnaccepted(input, ["restApiId", "patchOperations"]);
    const restApiId = unsimulated.require("restApiId", input.restApiId);

    const restApi = this.access.api({
      method: "PATCH",
      restApiId,
      caller: options?.caller,
    });
    const patch = simRestApiPatchOf(input.patchOperations ?? []);

    restApi.name = patch.name ?? restApi.name;
    restApi.description = patch.description ?? restApi.description;

    return { ...restApi.view(), $metadata: {} };
  }

  /**
   * Handle a DeleteRestApi command.
   *
   * The API's resources, methods, integrations, deployments and stages go with
   * it, since the API owns all of them. Its id stops resolving too, so the
   * endpoint it was issued reaches nothing.
   */
  deleteRestApi(
    command: SimDeleteRestApiCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimDeleteRestApiCommandOutput {
    const unsimulated = new SimApiGatewayUnsimulatedInput("DeleteRestApi");
    unsimulated.refuseUnaccepted(command.input, ["restApiId"]);
    const restApiId = unsimulated.require("restApiId", command.input.restApiId);

    const restApi = this.access.api({
      method: "DELETE",
      restApiId,
      caller: options?.caller,
    });

    // The API takes its stages with it, and a web ACL in front of one of them
    // is let go of with the stage it was protecting.
    for (const stage of restApi.stages.list()) {
      restApi.webAcls.release(restApi.stageArn(stage.stageName));
    }

    this.apis.remove(restApi.apiId);
    this.registry.deregisterApi(restApi.apiId);

    return { $metadata: {} };
  }
}
