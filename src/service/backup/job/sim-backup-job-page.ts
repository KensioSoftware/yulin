import { SimBackupInvalidParameterValueException } from "../error/sim-backup.error.js";
import type { SimBackupJob } from "./sim-backup-job.js";

const defaultMaxResults = 1000;
const maximumMaxResults = 1000;

export interface SimBackupJobPageInput {
  readonly ByResourceArn?: string | undefined;
  readonly ByState?: string | undefined;
  readonly ByBackupVaultName?: string | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}

/** One page of backup jobs and the token for the next page. */
export class SimBackupJobPage {
  public readonly jobs: readonly SimBackupJob[];
  public readonly nextToken: string | undefined;

  constructor(listed: readonly SimBackupJob[], input: SimBackupJobPageInput) {
    const matching = listed.filter((job) =>
      SimBackupJobPage.matches(job, input),
    );
    const startIndex = SimBackupJobPage.startIndex(
      input.NextToken,
      matching.length,
    );
    const nextIndex = startIndex + SimBackupJobPage.pageSize(input.MaxResults);
    this.jobs = matching.slice(startIndex, nextIndex);
    this.nextToken = SimBackupJobPage.tokenFor(nextIndex, matching.length);
  }

  /** Return whether a stored job satisfies all requested filters. */
  private static matches(
    job: SimBackupJob,
    input: SimBackupJobPageInput,
  ): boolean {
    return (
      (input.ByResourceArn === undefined ||
        job.resourceArn === input.ByResourceArn) &&
      (input.ByState === undefined || job.state === input.ByState) &&
      (input.ByBackupVaultName === undefined ||
        job.vaultName === input.ByBackupVaultName)
    );
  }

  /** Read and validate the requested page size. */
  private static pageSize(requested: number | undefined): number {
    const maxResults = requested ?? defaultMaxResults;
    if (
      !Number.isSafeInteger(maxResults) ||
      maxResults < 1 ||
      maxResults > maximumMaxResults
    ) {
      throw new SimBackupInvalidParameterValueException(
        `MaxResults ${String(requested)} is outside the range 1 to ${String(
          maximumMaxResults,
        )}`,
      );
    }
    return maxResults;
  }

  /** Read a continuation token as an offset into the filtered jobs. */
  private static startIndex(
    nextToken: string | undefined,
    listedCount: number,
  ): number {
    if (nextToken === undefined) {
      return 0;
    }
    const startIndex = Number(nextToken);
    if (
      !Number.isSafeInteger(startIndex) ||
      startIndex <= 0 ||
      startIndex >= listedCount ||
      String(startIndex) !== nextToken
    ) {
      throw new SimBackupInvalidParameterValueException(
        "NextToken is not a token this simulation issued",
      );
    }
    return startIndex;
  }

  /** Issue a continuation token when more jobs remain. */
  private static tokenFor(
    nextIndex: number,
    listedCount: number,
  ): string | undefined {
    if (nextIndex >= listedCount) {
      return undefined;
    }
    return String(nextIndex);
  }
}
