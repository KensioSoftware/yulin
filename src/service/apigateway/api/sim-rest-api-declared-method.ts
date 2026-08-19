import type { SimRestApiProxyAuthorization } from "./sim-rest-api-proxy-authorizer.js";
import type { SimApiGateway } from "../sim-api-gateway.js";

interface SimRestApiDeclaredMethodInput {
  readonly restApiId: string;
  readonly rootResourceId: string;
  readonly resourcePath: string;
  readonly httpMethod: string;
  readonly functionArn: string;
  /** How every method of the API says who may call it. */
  readonly authorization: SimRestApiProxyAuthorization;
}

/**
 * Declare every path template of an API, each with its method and the
 * integration behind it.
 *
 * They are declared one at a time because they share resources. Two paths
 * under `/orders` build that resource once, and whichever gets there first
 * creates it.
 */
export async function declaredMethods(
  apiGateway: SimApiGateway,
  resourcePaths: readonly string[],
  input: Omit<SimRestApiDeclaredMethodInput, "resourcePath">,
): Promise<void> {
  for (const resourcePath of resourcePaths) {
    // oxlint-disable-next-line no-await-in-loop -- paths share resources, so one at a time
    await declaredMethod(apiGateway, { ...input, resourcePath });
  }
}

/**
 * Declare one path template, its method, and the integration behind it.
 */
async function declaredMethod(
  apiGateway: SimApiGateway,
  input: SimRestApiDeclaredMethodInput,
): Promise<void> {
  const { restApiId, httpMethod } = input;
  const resourceId = await declaredResource(
    apiGateway,
    restApiId,
    input.rootResourceId,
    input.resourcePath,
  );

  await apiGateway.putMethod({
    input: { restApiId, resourceId, httpMethod, ...input.authorization },
  });
  await apiGateway.putIntegration({
    input: {
      restApiId,
      resourceId,
      httpMethod,
      type: "AWS_PROXY",
      integrationHttpMethod: "POST",
      uri: input.functionArn,
    },
  });
}

/**
 * Declare the chain of resources one path template needs, reusing whatever the
 * API already has, and answer the id of the leaf.
 */
async function declaredResource(
  apiGateway: SimApiGateway,
  restApiId: string,
  rootResourceId: string,
  resourcePath: string,
): Promise<string> {
  const pathParts = resourcePath.split("/").filter((part) => part !== "");
  let parentId = rootResourceId;

  for (const pathPart of pathParts) {
    const existing = apiGateway
      .findRestApi(restApiId)
      ?.resources.list()
      .find(
        (one) =>
          one.parentId === parentId && one.pathPart?.pathPart === pathPart,
      );

    if (existing !== undefined) {
      parentId = existing.resourceId;
      continue;
    }

    // Each resource is the parent of the next, so the chain is built one at a
    // time rather than in parallel.
    // oxlint-disable-next-line no-await-in-loop -- each parent id comes from the call before it
    const created = await apiGateway.createResource({
      input: { restApiId, parentId, pathPart },
    });
    parentId = created.id;
  }

  return parentId;
}
