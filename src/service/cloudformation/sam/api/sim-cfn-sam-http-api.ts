import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import {
  samCarriedAttributes,
  samResourceProperties,
} from "../function/sim-cfn-sam-function-properties.js";
import { samMergedApiProperties } from "../sim-cfn-sam-globals.js";
import { samPickedProperties } from "../sim-cfn-sam-picked.js";
import { samHttpApiStageResources } from "./sim-cfn-sam-http-api-stage.js";

interface SamHttpApiExpansionProperties {
  readonly logicalId: string;
  readonly resource: SimCfnTemplateValueRecord;
  readonly globals: SimCfnTemplateValueRecord;
}

/**
 * The SAM Resource type this expansion covers.
 */
export const samHttpApiType = "AWS::Serverless::HttpApi";

/**
 * The properties whose names and meanings are the same on both Resource types.
 * Expanding one of them is carrying it across.
 *
 * `Auth` and `Domain` are absent from the list. SAM writes an `Auth` block
 * into the OpenAPI document it generates, and deploys a `Domain` as a custom
 * domain name Resource. Neither is expanded here, and an API declaring one is
 * deployed without it.
 */
const propertyNames = new Set([
  "CorsConfiguration",
  "Description",
  "DisableExecuteApiEndpoint",
  "FailOnWarnings",
  "Name",
]);

/**
 * Expand one AWS::Serverless::HttpApi into the Resources CloudFormation
 * deploys for it.
 *
 * The API keeps the logical ID the template gave the SAM Resource. `Ref` and
 * `Fn::GetAtt` against that name answer what they answer for the API, and a
 * route naming the API by `ApiId` reaches the one the template declared. Its
 * stage is a second Resource named after it.
 *
 * A `DefinitionBody` is the API's OpenAPI document, and becomes the `Body` the
 * API is imported from, routes and integrations and all. A `DefinitionUri`
 * points at a document on disk or in S3. Nothing here reads either, and an API
 * declaring one is left as the template wrote it, to be recorded as
 * unsupported. The alternative is an API deployed with no routes at all.
 */
export function samHttpApiResources(
  properties: SamHttpApiExpansionProperties,
): Record<string, SimCfnTemplateValue> {
  const { logicalId, resource, globals } = properties;
  const apiProperties = samMergedApiProperties(
    globals,
    samResourceProperties(resource),
  );

  if (apiProperties["DefinitionUri"] !== undefined) {
    return { [logicalId]: resource };
  }

  return {
    [logicalId]: {
      Type: "AWS::ApiGatewayV2::Api",
      ...samCarriedAttributes(resource),
      Properties: {
        ...samPickedProperties(apiProperties, propertyNames),
        ...samHttpApiName(logicalId, apiProperties),
        ProtocolType: "HTTP",
        ...samHttpApiBody(apiProperties),
      },
    },
    ...samHttpApiStageResources({ logicalId, resource, apiProperties }),
  };
}

/**
 * The name of an API that named itself none.
 *
 * An HTTP API is named where a SAM one need not be, and the logical ID is the
 * name the template already has for it. An API imported from a document takes
 * its name from the document's title, and is left unnamed here for that title
 * to name.
 */
function samHttpApiName(
  logicalId: string,
  apiProperties: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const named =
    apiProperties["Name"] !== undefined ||
    apiProperties["DefinitionBody"] !== undefined;

  return named ? {} : { Name: logicalId };
}

/**
 * The OpenAPI document the API is imported from, where the template declared
 * one inline.
 */
function samHttpApiBody(
  apiProperties: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const definitionBody = apiProperties["DefinitionBody"];

  return definitionBody === undefined ? {} : { Body: definitionBody };
}
