import { SimBackupAlreadyExistsException } from "./error/sim-backup.error.js";
import type { SimBackupJob } from "./job/sim-backup-job.js";
import type { SimBackupPlan } from "./plan/sim-backup-plan.js";
import type { SimBackupSelection } from "./selection/sim-backup-selection.js";
import type { SimBackupVault } from "./vault/sim-backup-vault.js";

/**
 * Holds AWS Backup resources for one simulated account and Region.
 */
export class SimBackupStore {
  private readonly vaults = new Map<string, SimBackupVault>();
  private readonly plans = new Map<string, SimBackupPlan>();
  private readonly selections = new Map<string, SimBackupSelection>();
  private readonly jobs = new Map<string, SimBackupJob>();
  private readonly jobsByIdempotencyToken = new Map<string, SimBackupJob>();

  addVault(vault: SimBackupVault): void {
    if (this.vaults.has(vault.name)) {
      throw new SimBackupAlreadyExistsException(
        `A backup vault named ${vault.name} already exists`,
      );
    }
    this.vaults.set(vault.name, vault);
  }

  vault(name: string): SimBackupVault | undefined {
    return this.vaults.get(name);
  }

  allVaults(): MapIterator<SimBackupVault> {
    return this.vaults.values();
  }

  removeVault(name: string): void {
    this.vaults.delete(name);
  }

  addPlan(plan: SimBackupPlan): void {
    if (this.plans.values().some((stored) => stored.name === plan.name)) {
      throw new SimBackupAlreadyExistsException(
        `A backup plan named ${plan.name} already exists`,
      );
    }
    this.plans.set(plan.id, plan);
  }

  plan(id: string): SimBackupPlan | undefined {
    return this.plans.get(id);
  }

  removePlan(id: string): void {
    this.plans.delete(id);
    const selectionIds = this.selections
      .values()
      .filter((selection) => selection.planId === id)
      .map((selection) => selection.id)
      .toArray();
    for (const selectionId of selectionIds) this.selections.delete(selectionId);
  }

  addSelection(selection: SimBackupSelection): void {
    if (
      this.selections
        .values()
        .some(
          (stored) =>
            stored.planId === selection.planId &&
            stored.name === selection.name,
        )
    ) {
      throw new SimBackupAlreadyExistsException(
        `A backup selection named ${selection.name} already exists`,
      );
    }
    this.selections.set(selection.id, selection);
  }

  selection(id: string): SimBackupSelection | undefined {
    return this.selections.get(id);
  }

  selectionsForPlan(planId: string): IteratorObject<SimBackupSelection> {
    return this.selections
      .values()
      .filter((selection) => selection.planId === planId);
  }

  removeSelection(id: string): void {
    this.selections.delete(id);
  }

  addJob(job: SimBackupJob, idempotencyToken?: string): void {
    this.jobs.set(job.id, job);
    if (idempotencyToken !== undefined) {
      this.jobsByIdempotencyToken.set(idempotencyToken, job);
    }
  }

  job(id: string): SimBackupJob | undefined {
    return this.jobs.get(id);
  }

  jobByIdempotencyToken(token: string): SimBackupJob | undefined {
    return this.jobsByIdempotencyToken.get(token);
  }

  allJobs(): MapIterator<SimBackupJob> {
    return this.jobs.values();
  }
}
