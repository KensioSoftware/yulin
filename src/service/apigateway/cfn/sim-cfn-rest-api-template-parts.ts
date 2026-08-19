import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimCfnRestApiTemplateInput,
  SimCfnRestApiTemplateMethod,
} from "./sim-cfn-rest-api-template.factory.js";

/**
 * The Resources under the API in the template test factory, and the logical
 * IDs a test names them by.
 *
 * The path tree is the half of the template a test varies, because a REST API
 * spells one path over several Resources. The factory beside this holds the
 * Resources every template carries whatever its methods are.
 */

/**
 * The logical ID of the Resource carrying one path of the template's tree.
 *
 * A test asserting on a node names it through here, so the naming stays in one
 * place. The path spells the ID, so two methods under one path name one node.
 */
export function simCfnRestApiResourceLogicalId(
  path: readonly string[],
): string {
  return `Resource${path.map(pathPartLabel).join("")}`;
}

/**
 * The logical ID of the Resource carrying one method of the template's API.
 */
export function simCfnRestApiMethodLogicalId(
  method: SimCfnRestApiTemplateMethod,
): string {
  return `Method${method.httpMethod}${method.path.map(pathPartLabel).join("")}`;
}

/**
 * One AWS::ApiGateway::Resource per node the template's methods need, each
 * naming its parent by `Ref` and the root by `Fn::GetAtt RootResourceId`.
 *
 * Two methods under one path spell the same logical ID, so they share the node
 * rather than declaring it twice.
 */
export function pathResources(
  input: SimCfnRestApiTemplateInput,
): SimCfnTemplateValueRecord {
  const resources: SimCfnTemplateValueRecord = {};

  for (const method of input.methods) {
    for (const [index, pathPart] of method.path.entries()) {
      const path = method.path.slice(0, index + 1);

      resources[simCfnRestApiResourceLogicalId(path)] = {
        Type: "AWS::ApiGateway::Resource",
        Properties: {
          RestApiId: { Ref: "Api" },
          ParentId: resourceIdValue(path.slice(0, -1)),
          PathPart: pathPart,
        },
      };
    }
  }

  return resources;
}

/**
 * One AWS::ApiGateway::Method per method, each carrying the proxy integration
 * as a block of its own, the way a template declares one.
 */
export function methodResources(
  input: SimCfnRestApiTemplateInput,
): SimCfnTemplateValueRecord {
  const methods: SimCfnTemplateValueRecord = {};

  for (const method of input.methods) {
    methods[simCfnRestApiMethodLogicalId(method)] = {
      Type: "AWS::ApiGateway::Method",
      Properties: {
        RestApiId: { Ref: "Api" },
        ResourceId: resourceIdValue(method.path),
        HttpMethod: method.httpMethod,
        AuthorizationType: "NONE",
        Integration: {
          Type: "AWS_PROXY",
          IntegrationHttpMethod: "POST",
          Uri: {
            "Fn::Join": [
              "",
              [
                "arn:aws:apigateway:",
                { Ref: "AWS::Region" },
                ":lambda:path/2015-03-31/functions/",
                { "Fn::GetAtt": ["Handler", "Arn"] },
                "/invocations",
              ],
            ],
          },
          ...input.integrationProperties,
        },
        ...input.methodProperties,
      },
    };
  }

  return methods;
}

/**
 * What a template names one node of the tree by, which is the API's root
 * resource for the empty path and a `Ref` to the node's own Resource
 * otherwise.
 */
function resourceIdValue(path: readonly string[]): SimCfnTemplateValueRecord {
  return path.length === 0
    ? { "Fn::GetAtt": ["Api", "RootResourceId"] }
    : { Ref: simCfnRestApiResourceLogicalId(path) };
}

/**
 * The methods the deployment waits for, as CDK's `DependsOn` does, so the
 * stage is published after everything it serves.
 */
export function methodLogicalIds(input: SimCfnRestApiTemplateInput): string[] {
  return input.methods.map((method) => simCfnRestApiMethodLogicalId(method));
}

/**
 * One path segment as part of a logical ID, with the braces of a path
 * parameter taken out, since a logical ID is alphanumeric.
 */
function pathPartLabel(pathPart: string): string {
  return pathPart.replaceAll(/[^a-zA-Z0-9]/g, "");
}
