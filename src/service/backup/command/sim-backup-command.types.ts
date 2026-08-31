export interface SimBackupLifecycle {
  readonly MoveToColdStorageAfterDays?: number | undefined;
  readonly DeleteAfterDays?: number | undefined;
}

export interface SimBackupRuleInput {
  readonly RuleName?: string | undefined;
  readonly TargetBackupVaultName?: string | undefined;
  readonly ScheduleExpression?: string | undefined;
  readonly Lifecycle?: SimBackupLifecycle | undefined;
}

export interface SimBackupRule extends SimBackupRuleInput {
  readonly RuleId: string;
  readonly RuleName: string;
  readonly TargetBackupVaultName: string;
  readonly ScheduleExpression: string;
}

export interface SimRecoveryPointCreator {
  readonly BackupPlanId?: string | undefined;
  readonly BackupPlanArn?: string | undefined;
  readonly BackupPlanName?: string | undefined;
  readonly BackupPlanVersion?: string | undefined;
  readonly BackupRuleId?: string | undefined;
  readonly BackupRuleName?: string | undefined;
}

export interface SimCalculatedLifecycle {
  readonly MoveToColdStorageAt?: Date | undefined;
  readonly DeleteAt?: Date | undefined;
}

export interface SimBackupPlanInput {
  readonly BackupPlanName?: string | undefined;
  readonly Rules?: readonly SimBackupRuleInput[] | undefined;
}

export interface SimBackupSelectionInput {
  readonly SelectionName?: string | undefined;
  readonly IamRoleArn?: string | undefined;
  readonly Resources?: readonly string[] | undefined;
}

export interface SimBackupCommand<Input> {
  readonly input: Input;
}

export type SimCreateBackupVaultCommand = SimBackupCommand<{
  readonly BackupVaultName?: string | undefined;
  readonly BackupVaultTags?: Readonly<Record<string, string>> | undefined;
  readonly EncryptionKeyArn?: string | undefined;
  readonly CreatorRequestId?: string | undefined;
}>;

export interface SimCreateBackupVaultCommandOutput {
  readonly BackupVaultName?: string | undefined;
  readonly BackupVaultArn?: string | undefined;
  readonly CreationDate?: Date | undefined;
}

export type SimDescribeBackupVaultCommand = SimBackupCommand<{
  readonly BackupVaultName?: string | undefined;
}>;

export interface SimDescribeBackupVaultCommandOutput {
  readonly BackupVaultName?: string | undefined;
  readonly BackupVaultArn?: string | undefined;
  readonly EncryptionKeyArn?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly CreatorRequestId?: string | undefined;
  readonly NumberOfRecoveryPoints?: number | undefined;
  readonly Locked?: boolean | undefined;
  readonly MinRetentionDays?: number | undefined;
  readonly MaxRetentionDays?: number | undefined;
  readonly LockDate?: Date | undefined;
}

export type SimDeleteBackupVaultCommand = SimDescribeBackupVaultCommand;
export type SimDeleteBackupVaultCommandOutput = object;

export type SimListBackupVaultsCommand = SimBackupCommand<{
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}>;

export interface SimBackupVaultListMember {
  readonly BackupVaultName?: string | undefined;
  readonly BackupVaultArn?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly EncryptionKeyArn?: string | undefined;
  readonly CreatorRequestId?: string | undefined;
  readonly NumberOfRecoveryPoints?: number | undefined;
  readonly Locked?: boolean | undefined;
  readonly MinRetentionDays?: number | undefined;
  readonly MaxRetentionDays?: number | undefined;
  readonly LockDate?: Date | undefined;
}

export interface SimListBackupVaultsCommandOutput {
  readonly BackupVaultList?: readonly SimBackupVaultListMember[] | undefined;
  readonly NextToken?: string | undefined;
}

export type SimPutBackupVaultLockConfigurationCommand = SimBackupCommand<{
  readonly BackupVaultName?: string | undefined;
  readonly MinRetentionDays?: number | undefined;
  readonly MaxRetentionDays?: number | undefined;
  readonly ChangeableForDays?: number | undefined;
}>;
export type SimPutBackupVaultLockConfigurationCommandOutput = object;

export type SimCreateBackupPlanCommand = SimBackupCommand<{
  readonly BackupPlan?: SimBackupPlanInput | undefined;
  readonly CreatorRequestId?: string | undefined;
}>;

export interface SimCreateBackupPlanCommandOutput {
  readonly BackupPlanId?: string | undefined;
  readonly BackupPlanArn?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly VersionId?: string | undefined;
}

export type SimGetBackupPlanCommand = SimBackupCommand<{
  readonly BackupPlanId?: string | undefined;
  readonly VersionId?: string | undefined;
}>;

export interface SimGetBackupPlanCommandOutput {
  readonly BackupPlan?: {
    readonly BackupPlanName?: string | undefined;
    readonly Rules?: readonly SimBackupRule[] | undefined;
  };
  readonly BackupPlanId?: string | undefined;
  readonly BackupPlanArn?: string | undefined;
  readonly VersionId?: string | undefined;
  readonly CreatorRequestId?: string | undefined;
  readonly CreationDate?: Date | undefined;
}

export type SimCreateBackupSelectionCommand = SimBackupCommand<{
  readonly BackupPlanId?: string | undefined;
  readonly BackupSelection?: SimBackupSelectionInput | undefined;
  readonly CreatorRequestId?: string | undefined;
}>;

export interface SimCreateBackupSelectionCommandOutput {
  readonly SelectionId?: string | undefined;
  readonly BackupPlanId?: string | undefined;
  readonly CreationDate?: Date | undefined;
}

export type SimGetBackupSelectionCommand = SimBackupCommand<{
  readonly BackupPlanId?: string | undefined;
  readonly SelectionId?: string | undefined;
}>;

export interface SimGetBackupSelectionCommandOutput {
  readonly BackupSelection?: SimBackupSelectionInput | undefined;
  readonly SelectionId?: string | undefined;
  readonly BackupPlanId?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly CreatorRequestId?: string | undefined;
}

export type SimListBackupSelectionsCommand = SimBackupCommand<{
  readonly BackupPlanId?: string | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}>;

export interface SimBackupSelectionListMember {
  readonly SelectionId?: string | undefined;
  readonly SelectionName?: string | undefined;
  readonly BackupPlanId?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly CreatorRequestId?: string | undefined;
  readonly IamRoleArn?: string | undefined;
}

export interface SimListBackupSelectionsCommandOutput {
  readonly BackupSelectionsList?:
    | readonly SimBackupSelectionListMember[]
    | undefined;
  readonly NextToken?: string | undefined;
}

export type SimStartBackupJobCommand = SimBackupCommand<{
  readonly BackupVaultName?: string | undefined;
  readonly ResourceArn?: string | undefined;
  readonly IamRoleArn?: string | undefined;
  readonly IdempotencyToken?: string | undefined;
  readonly Lifecycle?: SimBackupLifecycle | undefined;
}>;

export interface SimStartBackupJobCommandOutput {
  readonly BackupJobId?: string | undefined;
  readonly RecoveryPointArn?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly IsParent?: boolean | undefined;
}

export type SimDescribeBackupJobCommand = SimBackupCommand<{
  readonly BackupJobId?: string | undefined;
}>;

export interface SimBackupJobOutput {
  readonly AccountId?: string | undefined;
  readonly BackupJobId?: string | undefined;
  readonly BackupVaultName?: string | undefined;
  readonly BackupVaultArn?: string | undefined;
  readonly RecoveryPointArn?: string | undefined;
  readonly ResourceArn?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly InitiationDate?: Date | undefined;
  readonly CompletionDate?: Date | undefined;
  readonly State?: string | undefined;
  readonly StatusMessage?: string | undefined;
  readonly PercentDone?: string | undefined;
  readonly IamRoleArn?: string | undefined;
  readonly CreatedBy?: SimRecoveryPointCreator | undefined;
  readonly RecoveryPointLifecycle?: SimBackupLifecycle | undefined;
  readonly IsParent?: boolean | undefined;
  readonly MessageCategory?: string | undefined;
}

export type SimDescribeBackupJobCommandOutput = SimBackupJobOutput;

export type SimListBackupJobsCommand = SimBackupCommand<{
  readonly ByResourceArn?: string | undefined;
  readonly ByState?: string | undefined;
  readonly ByBackupVaultName?: string | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}>;

export interface SimListBackupJobsCommandOutput {
  readonly BackupJobs?: readonly SimBackupJobOutput[] | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimRecoveryPointOutput {
  readonly RecoveryPointArn?: string | undefined;
  readonly BackupVaultName?: string | undefined;
  readonly BackupVaultArn?: string | undefined;
  readonly ResourceArn?: string | undefined;
  readonly CreatedBy?: SimRecoveryPointCreator | undefined;
  readonly IamRoleArn?: string | undefined;
  readonly Status?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly InitiationDate?: Date | undefined;
  readonly CompletionDate?: Date | undefined;
  readonly CalculatedLifecycle?: SimCalculatedLifecycle | undefined;
  readonly Lifecycle?: SimBackupLifecycle | undefined;
  readonly EncryptionKeyArn?: string | undefined;
  readonly IsEncrypted?: boolean | undefined;
  readonly VaultType?: string | undefined;
}

export type SimListRecoveryPointsByBackupVaultCommand = SimBackupCommand<{
  readonly BackupVaultName?: string | undefined;
  readonly ByResourceArn?: string | undefined;
  readonly ByBackupPlanId?: string | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}>;

export interface SimListRecoveryPointsByBackupVaultCommandOutput {
  readonly RecoveryPoints?: readonly SimRecoveryPointOutput[] | undefined;
  readonly NextToken?: string | undefined;
}

export type SimDescribeRecoveryPointCommand = SimBackupCommand<{
  readonly BackupVaultName?: string | undefined;
  readonly RecoveryPointArn?: string | undefined;
}>;

export type SimDescribeRecoveryPointCommandOutput = SimRecoveryPointOutput;
