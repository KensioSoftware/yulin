import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import {
  samCarriedAttributes,
  samConditionAttribute,
  samResourceProperties,
} from "../function/sim-cfn-sam-function-properties.js";
import { samMergedApiProperties } from "../sim-cfn-sam-globals.js";
import { samPickedProperties } from "../sim-cfn-sam-picked.js";
import { samApiAuthResources } from "./auth/sim-cfn-sam-api-auth.js";
import { samRestApiAuth } from "./auth/sim-cfn-sam-rest-api-auth.js";
import { samRestApiStageResources } from "./sim-cfn-sam-rest-api-stage.js";

interface SamRestApiExpansionProperties {
  readonly logicalId: string;
  readonly resource: SimCfnTemplateValueRecord;
  readonly globals: SimCfnTemplateValueRecord;
  /**
   * What names an API that names itself none. The logical ID names one the
   * template declared, and the implicit API asks for the stack name SAM titles
   * it with.
   */
  readonly defaultName?: SimCfnTemplateValue;
}

/**
 * The SAM Resource type this expansion covers.
 */
export const samRestApiType = "AWS::Serverless::Api";

/**
 * The properties whose names and meanings are the same on both Resource types.
 * Expanding one of them is carrying it across.
 *
 * `Cors`, `Domain`, `GatewayResponses`, `MethodSettings` and
 * `BinaryMediaTypes` are absent from the list. SAM writes all of them into the
 * Swagger document it generates, and none is expanded here, so an API
 * declaring one is deployed without it. `Auth` is absent for the opposite
 * reason. It becomes authorizer Resources of its own beside the API.
 */
const propertyNames = new Set([
  "Description",
  "DisableExecuteApiEndpoint",
  "Name",
]);

/**
 * Expand one AWS::Serverless::Api into the Resources CloudFormation deploys
 * for it.
 *
 * The API keeps the logical ID the template gave the SAM Resource. `Ref` and
 * `Fn::GetAtt` against that name answer what they answer for the API, and an
 * event naming the API by `RestApiId` reaches the one the template declared.
 * Its deployment and stage are two Resources named after it.
 *
 * SAM expands a REST API through a Swagger 2.0 document, with the paths,
 * methods and integrations written into the `Body` of the API. The Resources
 * are written directly here instead, the way the HTTP API expansion beside
 * this one does, so a method is an `AWS::ApiGateway::Method` a Stack holds and
 * tears down rather than a line of a document nothing reads.
 *
 * A `DefinitionBody` goes on as the API's `Body`, which is imported where it
 * is an OpenAPI 3.0 document. SAM writes Swagger 2.0 unless the template asks
 * for `OpenApiVersion: 3.0.1`, and the API is created without a Swagger
 * document and the record says so. A `DefinitionUri` points at a document on
 * disk or in S3, and an API declaring one is left as the template wrote it, to
 * be recorded as unsupported. The alternative is an API deployed with an empty
 * path tree and no sign of why.
 */
export function samRestApiResources(
  properties: SamRestApiExpansionProperties,
): Record<string, SimCfnTemplateValue> {
  const { logicalId, resource, globals, defaultName = logicalId } = properties;
  const apiProperties = samMergedApiProperties(
    globals,
    samResourceProperties(resource),
  );

  if (apiProperties["DefinitionUri"] !== undefined) {
    return { [logicalId]: resource };
  }

  return {
    [logicalId]: {
      Type: "AWS::ApiGateway::RestApi",
      ...samCarriedAttributes(resource),
      Properties: {
        Name: defaultName,
        ...samPickedProperties(apiProperties, propertyNames),
        ...samRestApiBody(apiProperties),
      },
    },
    ...samRestApiStageResources({ logicalId, resource, apiProperties }),
    ...samApiAuthResources(
      samRestApiAuth(logicalId, apiProperties),
      samConditionAttribute(resource["Condition"]),
    ),
  };
}

/**
 * The document the API is imported from, where the template declared one
 * inline.
 *
 * A REST API is named whatever the template named it either way. The document
 * carries a title of its own, and an API Gateway REST API takes a name whether
 * a document declares one or not.
 */
function samRestApiBody(
  apiProperties: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const definitionBody = apiProperties["DefinitionBody"];

  return definitionBody === undefined ? {} : { Body: definitionBody };
}
