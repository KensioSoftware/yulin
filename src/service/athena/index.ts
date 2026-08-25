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
export { SimAthenaQueryExecution } from "./execution/sim-athena-query-execution.js";
export { SimAthenaQueryExecutionStore } from "./execution/sim-athena-query-execution-store.js";
export {
  isSettledQueryState,
  type SimAthenaQueryState,
} from "./execution/sim-athena-query-state.js";
export { SimAthenaOutputLocation } from "./execution/sim-athena-output-location.js";
export {
  SimAthenaQueryResults,
  type SimAthenaResultRequest,
} from "./result/sim-athena-query-results.js";
export type {
  SimAthenaDeclaredColumn,
  SimAthenaDeclaredResult,
} from "./result/sim-athena-declared-result.js";
export { SimAthenaResolvedResult } from "./result/sim-athena-resolved-result.js";
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
