import type { SimAws } from "../../aws/sim-aws.js";
import type { Brand } from "../../../util/brand.type.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";

/**
 * Parsed CloudFormation template object.
 *
 * Yulin accepts already-parsed templates and does not parse JSON or YAML itself.
 */
export type SimCloudFormationTemplate = Record<string, unknown>;

export type SimCloudFormationStackName = Brand<
  string,
  "SimCloudFormationStackName"
>;

export type SimCloudFormationStackStatus =
  | "REVIEW_IN_PROGRESS"
  | "CREATE_IN_PROGRESS"
  | "CREATE_COMPLETE";

export interface SimCloudFormationResource {
  readonly logicalId: string;
  readonly template: Record<string, unknown>;
}

interface SimCloudFormationStackProps {
  readonly simAws: SimAws;
  readonly background: BackgroundScheduler;
  readonly stackName: SimCloudFormationStackName;
  readonly template: SimCloudFormationTemplate;
}

/**
 * Lightweight simulated CloudFormation Stack.
 *
 * This is intentionally not a detailed simulation of CloudFormation Stack
 * mechanics. It is a small container for the Stack identity, template, status,
 * and resources, so CloudFormation template interpretation has a stable concept
 * to build on later.
 */
export class SimCloudFormationStack {
  private readonly simAws: SimAws;
  private readonly background: BackgroundScheduler;
  private _status: SimCloudFormationStackStatus = "REVIEW_IN_PROGRESS";
  public readonly stackName: SimCloudFormationStackName;
  public readonly template: SimCloudFormationTemplate;
  public readonly resources = new Map<string, SimCloudFormationResource>();

  constructor(props: SimCloudFormationStackProps) {
    const { simAws, background, stackName, template } = props;

    this.simAws = simAws;
    this.background = background;
    this.stackName = stackName;
    this.template = template;

    this.recordTemplateResources();
  }

  /**
   * Get the current Stack status.
   */
  public get status(): SimCloudFormationStackStatus {
    return this._status;
  }

  /**
   * Deploy this Stack into simulated AWS.
   */
  async deploy(): Promise<void> {
    await this.background.sequence();

    this._status = "CREATE_IN_PROGRESS";
    this.background.schedule(async () => this.deployResources());
  }

  private async deployResources(): Promise<void> {
    void this.simAws;

    await Promise.resolve();

    this._status = "CREATE_COMPLETE";
  }

  private recordTemplateResources(): void {
    const resources = this.template["Resources"];

    if (!isRecord(resources)) {
      return;
    }

    /* v8 ignore start -- not implemented yet TODO */
    for (const [logicalId, resourceTemplate] of Object.entries(resources)) {
      if (!isRecord(resourceTemplate)) {
        continue;
      }

      this.resources.set(logicalId, {
        logicalId,
        template: resourceTemplate,
      });
    }
    /* v8 ignore stop -- not implemented yet TODO */
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
