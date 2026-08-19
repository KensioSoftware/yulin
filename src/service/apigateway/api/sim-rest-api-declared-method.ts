import type { SimPutMethodCommandInput } from "../command/method/method.command.js";
import type { SimApiGateway } from "../sim-api-gateway.js";

interface SimRestApiDeclaredMethodInput {
  readonly restApiId: string;
  readonly rootResourceId: string;
  readonly resourcePath: string;
  readonly httpMethod: string;
  readonly functionArn: string;
  /** The authorizer every method is gated by, where the API has one. */
  readonly authorizerId: string | undefined;
  /** Whether every method is decided by IAM instead. */
  readonly iamAuthorization: boolean;
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
    input: {
      restApiId,
      resourceId,
      httpMethod,
      ...declaredAuthorization(input),
    },
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
 * The authorization every method of the API is declared with.
 *
 * An `AWS_IAM` method names no authorizer, so a test asking for both is asking
 * for something PutMethod refuses, and gets that refusal.
 */
function declaredAuthorization(
  input: SimRestApiDeclaredMethodInput,
): Pick<SimPutMethodCommandInput, "authorizationType" | "authorizerId"> {
  if (input.authorizerId !== undefined) {
    return { authorizationType: "CUSTOM", authorizerId: input.authorizerId };
  }

  return {
    authorizationType: input.iamAuthorization ? "AWS_IAM" : "NONE",
  };
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
