import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * How a workgroup's query results are encrypted, as a request carries it.
 */
export interface SimAthenaEncryptionConfigurationInput {
  readonly EncryptionOption?: string | undefined;
  readonly KmsKey?: string | undefined;
}

/**
 * The ACL a workgroup's result objects are written with.
 */
export interface SimAthenaAclConfigurationInput {
  readonly S3AclOption?: string | undefined;
}

/**
 * Where a workgroup's query results go, as a request carries it.
 */
export interface SimAthenaResultConfigurationInput {
  readonly OutputLocation?: string | undefined;
  readonly EncryptionConfiguration?:
    | SimAthenaEncryptionConfigurationInput
    | undefined;
  readonly AclConfiguration?: SimAthenaAclConfigurationInput | undefined;
  readonly ExpectedBucketOwner?: string | undefined;
}

/**
 * The same, as an update carries it, with a removal flag per field.
 */
export interface SimAthenaResultConfigurationUpdatesInput extends SimAthenaResultConfigurationInput {
  readonly RemoveOutputLocation?: boolean | undefined;
  readonly RemoveEncryptionConfiguration?: boolean | undefined;
  readonly RemoveAclConfiguration?: boolean | undefined;
  readonly RemoveExpectedBucketOwner?: boolean | undefined;
}

/**
 * Which query engine a workgroup runs on.
 */
export interface SimAthenaEngineVersionInput {
  readonly SelectedEngineVersion?: string | undefined;
  readonly EffectiveEngineVersion?: string | undefined;
}

/**
 * A workgroup's settings, as `CreateWorkGroup` carries them.
 */
export interface SimAthenaWorkGroupConfigurationInput {
  readonly BytesScannedCutoffPerQuery?: number | undefined;
  readonly EnforceWorkGroupConfiguration?: boolean | undefined;
  readonly PublishCloudWatchMetricsEnabled?: boolean | undefined;
  readonly RequesterPaysEnabled?: boolean | undefined;
  readonly ResultConfiguration?: SimAthenaResultConfigurationInput | undefined;
  readonly EngineVersion?: SimAthenaEngineVersionInput | undefined;
}

/**
 * A workgroup's settings, as `UpdateWorkGroup` carries them.
 */
export interface SimAthenaWorkGroupConfigurationUpdatesInput {
  readonly BytesScannedCutoffPerQuery?: number | undefined;
  readonly RemoveBytesScannedCutoffPerQuery?: boolean | undefined;
  readonly EnforceWorkGroupConfiguration?: boolean | undefined;
  readonly PublishCloudWatchMetricsEnabled?: boolean | undefined;
  readonly RequesterPaysEnabled?: boolean | undefined;
  readonly ResultConfigurationUpdates?:
    | SimAthenaResultConfigurationUpdatesInput
    | undefined;
  readonly EngineVersion?: SimAthenaEngineVersionInput | undefined;
}

/**
 * A workgroup, as a response carries it.
 */
export interface SimAthenaDescribedWorkGroup {
  readonly Name?: string | undefined;
  readonly State?: string | undefined;
  readonly Description?: string | undefined;
  readonly CreationTime?: Date | undefined;
  readonly Configuration?: SimAthenaWorkGroupConfigurationInput | undefined;
}

/**
 * A workgroup, as a listing carries it.
 */
export interface SimAthenaListedWorkGroup {
  readonly Name?: string | undefined;
  readonly State?: string | undefined;
  readonly Description?: string | undefined;
  readonly CreationTime?: Date | undefined;
  readonly EngineVersion?: SimAthenaEngineVersionInput | undefined;
}

/**
 * Minimal structural sim Athena CreateWorkGroup command.
 *
 * https://docs.aws.amazon.com/athena/latest/APIReference/API_CreateWorkGroup.html
 */
export interface SimCreateWorkGroupCommand {
  readonly input: SimCreateWorkGroupCommandInput;
}

export interface SimCreateWorkGroupCommandInput {
  readonly Name?: string | undefined;
  readonly Description?: string | undefined;
  readonly Configuration?: SimAthenaWorkGroupConfigurationInput | undefined;
  readonly Tags?: unknown;
}

export interface SimCreateWorkGroupCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Athena GetWorkGroup command.
 *
 * https://docs.aws.amazon.com/athena/latest/APIReference/API_GetWorkGroup.html
 */
export interface SimGetWorkGroupCommand {
  readonly input: SimGetWorkGroupCommandInput;
}

export interface SimGetWorkGroupCommandInput {
  readonly WorkGroup?: string | undefined;
}

export interface SimGetWorkGroupCommandOutput {
  readonly WorkGroup?: SimAthenaDescribedWorkGroup | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Athena UpdateWorkGroup command.
 *
 * https://docs.aws.amazon.com/athena/latest/APIReference/API_UpdateWorkGroup.html
 */
export interface SimUpdateWorkGroupCommand {
  readonly input: SimUpdateWorkGroupCommandInput;
}

export interface SimUpdateWorkGroupCommandInput {
  readonly WorkGroup?: string | undefined;
  readonly Description?: string | undefined;
  readonly State?: string | undefined;
  readonly ConfigurationUpdates?:
    | SimAthenaWorkGroupConfigurationUpdatesInput
    | undefined;
}

export interface SimUpdateWorkGroupCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Athena DeleteWorkGroup command.
 *
 * https://docs.aws.amazon.com/athena/latest/APIReference/API_DeleteWorkGroup.html
 */
export interface SimDeleteWorkGroupCommand {
  readonly input: SimDeleteWorkGroupCommandInput;
}

export interface SimDeleteWorkGroupCommandInput {
  readonly WorkGroup?: string | undefined;
  readonly RecursiveDeleteOption?: boolean | undefined;
}

export interface SimDeleteWorkGroupCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Athena ListWorkGroups command.
 *
 * https://docs.aws.amazon.com/athena/latest/APIReference/API_ListWorkGroups.html
 */
export interface SimListWorkGroupsCommand {
  readonly input: SimListWorkGroupsCommandInput;
}

export interface SimListWorkGroupsCommandInput {
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimListWorkGroupsCommandOutput {
  readonly WorkGroups?: readonly SimAthenaListedWorkGroup[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
