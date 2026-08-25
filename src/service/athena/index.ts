export { SimAthena } from "./sim-athena.js";
export type { SimAthenaRequestOptions } from "./command/sim-athena-request-options.js";
export { athenaWorkGroupArn } from "./sim-athena-arn.js";
export {
  SimAthenaWorkGroup,
  type SimAthenaWorkGroupState,
} from "./workgroup/sim-athena-work-group.js";
export {
  primaryWorkGroupName,
  requestedWorkGroupName,
  requiredWorkGroupName,
} from "./workgroup/sim-athena-work-group-name.js";
export {
  SimAthenaWorkGroupConfiguration,
  type SimAthenaEngineVersion,
} from "./workgroup/sim-athena-work-group-configuration.js";
export type {
  SimAthenaResultConfigurationUpdates,
  SimAthenaWorkGroupConfigurationUpdates,
} from "./workgroup/sim-athena-work-group-updates.js";
export {
  SimAthenaResultConfiguration,
  type SimAthenaResultAcl,
  type SimAthenaResultEncryption,
} from "./workgroup/sim-athena-result-configuration.js";
export { SimAthenaWorkGroupStore } from "./workgroup/sim-athena-work-group-store.js";
export { SimAthenaNamedQuery } from "./named-query/sim-athena-named-query.js";
export { SimAthenaNamedQueryStore } from "./named-query/sim-athena-named-query-store.js";
export {
  athenaNamedQueryResourceType,
  athenaWorkGroupResourceType,
} from "./cfn/sim-cfn-athena-resource-types.js";
export {
  SimAthenaAccessDeniedException,
  SimAthenaError,
  type SimAthenaErrorMetadata,
  SimAthenaInvalidRequestException,
} from "./error/sim-athena.error.js";
