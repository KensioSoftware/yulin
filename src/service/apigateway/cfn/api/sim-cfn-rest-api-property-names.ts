/**
 * The AWS::ApiGateway::RestApi properties this simulation deploys.
 *
 * `BodyS3Location`, `Mode`, `EndpointConfiguration`, `Policy`,
 * `BinaryMediaTypes`, `MinimumCompressionSize`, `ApiKeySourceType`,
 * `Parameters`, `CloneFrom` and `Tags` are all left out, so a template
 * carrying one has it recorded against the Resource. The API is created
 * without it.
 */
export const simCfnRestApiSimulatedProperties = [
  "Name",
  "Description",
  "DisableExecuteApiEndpoint",
  "Body",
  "FailOnWarnings",
];
