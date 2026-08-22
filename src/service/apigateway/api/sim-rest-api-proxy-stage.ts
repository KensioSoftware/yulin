import type { SimApiGateway } from "../sim-api-gateway.js";
import type { SimRestApiMethodSettingsMap } from "./stage/settings/sim-rest-api-method-settings.type.js";

export interface SimRestApiProxyStageInput {
  /** The stage the API is deployed to, which every request goes through. */
  readonly stageName: string;
  /** The variables that stage carries. */
  readonly stageVariables: Readonly<Record<string, string>>;
  /**
   * The throttle that stage serves its methods at, keyed as CreateStage keys
   * one.
   */
  readonly methodSettings: SimRestApiMethodSettingsMap | undefined;
}

/**
 * Deploy a test's REST API and publish it to the stage the test asked for.
 *
 * A deployment publishes its own stage in one call, which is the shorter path
 * and the one most of these tests take. A stage carrying method settings is
 * created by CreateStage instead, since a deployment carries none.
 */
export async function simRestApiProxyStage(
  apiGateway: SimApiGateway,
  input: SimRestApiProxyStageInput,
  restApiId: string,
): Promise<void> {
  const { methodSettings, stageName, stageVariables } = input;
  const throttled = methodSettings !== undefined;
  const deployment = await apiGateway.createDeployment({
    input: {
      restApiId,
      stageName: throttled ? undefined : stageName,
      variables: throttled ? undefined : stageVariables,
    },
  });

  if (!throttled) {
    return;
  }

  await apiGateway.createStage({
    input: {
      restApiId,
      stageName,
      deploymentId: deployment.id,
      variables: stageVariables,
      methodSettings,
    },
  });
}
