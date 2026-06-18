import type { SimAws } from "../../aws/sim-aws.js";
import type { Brand } from "../../../util/brand.type.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimCfnResource } from "../resource/sim-cfn-resource.js";

/**
 * Parsed CloudFormation template object.
 *
 * Yulin accepts already-parsed templates and does not parse JSON or YAML itself.
 */
export type SimCloudFormationTemplate = Record<string, unknown>;

export type SimCloudFormationParameterValue = string;

export type SimCloudFormationParameterValues = Record<
  string,
  SimCloudFormationParameterValue
>;

export type SimCloudFormationStackName = Brand<
  string,
  "SimCloudFormationStackName"
>;

export type SimCloudFormationStackStatus =
  | "REVIEW_IN_PROGRESS"
  | "CREATE_IN_PROGRESS"
  | "CREATE_COMPLETE"
  | "CREATE_FAILED";

interface SimCloudFormationStackProps {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
  readonly stackName: SimCloudFormationStackName;
  readonly template: SimCloudFormationTemplate;
  readonly parameters?: SimCloudFormationParameterValues | undefined;
}

/**
 * Lightweight simulated CloudFormation Stack.
 */
export class SimCloudFormationStack {
  private readonly simAws: SimAws;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly background: BackgroundScheduler;
  private readonly parameters: SimCloudFormationParameterValues;
  private _status: SimCloudFormationStackStatus = "REVIEW_IN_PROGRESS";

  private deployCompletePromise: Promise<void> | undefined;
  private deployError: Error | undefined;

  public readonly stackName: SimCloudFormationStackName;
  public readonly template: SimCloudFormationTemplate;
  public readonly resources = new Map<string, SimCfnResource>();

  constructor(props: SimCloudFormationStackProps) {
    const {
      simAws,
      accountRegionScope,
      background,
      stackName,
      template,
      parameters = {},
    } = props;

    this.simAws = simAws;
    this.accountRegionScope = accountRegionScope;
    this.background = background;
    this.stackName = stackName;
    this.template = template;
    this.parameters = this.resolveParameterValues(parameters);

    this.recordTemplateResources();
  }

  /**
   * Get the current Stack status.
   */
  public get status(): SimCloudFormationStackStatus {
    return this._status;
  }

  /**
   * Get the deployment error, if Stack deployment failed.
   */
  public get error(): Error | undefined {
    return this.deployError;
  }

  /**
   * Deploy this simulated Stack into simulated AWS.
   */
  async deploy(): Promise<void> {
    if (this._status !== "REVIEW_IN_PROGRESS") {
      throw new Error(
        `Sim CloudFormation Stack ${this.stackName} cannot be deployed from ${this._status} status`,
      );
    }

    this._status = "CREATE_IN_PROGRESS";
    this.deployError = undefined;

    await this.background.sequence();

    this.deployCompletePromise = new Promise<void>((resolve) => {
      this.background.schedule(async () => {
        try {
          await this.deployResources();
          this._status = "CREATE_COMPLETE";
        } catch (error) {
          const stackError =
            error instanceof Error
              ? error
              : new Error(
                  `Sim CloudFormation Stack deploy failed: ${String(error)}`,
                );

          this._status = "CREATE_FAILED";
          this.deployError = stackError;
        } finally {
          resolve();
        }
      });
    });
  }

  /**
   * Wait for the stack to finish deploying.
   */
  async waitForDeployComplete(): Promise<void> {
    if (this.deployCompletePromise !== undefined) {
      await this.deployCompletePromise;
    }

    if (this.deployError !== undefined) {
      throw this.deployError;
    }
  }

  private async deployResources(): Promise<void> {
    let pendingResources = new Set(this.resources.values());

    while (pendingResources.size > 0) {
      const creatableResources = [...pendingResources].filter((resource) => {
        return resource.canCreate(this.resources);
      });

      if (creatableResources.length === 0) {
        throw new Error(
          `Could not resolve simulated CloudFormation Resource dependencies in Stack ${this.stackName}`,
        );
      }

      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        creatableResources.map(async (resource) => {
          await resource.create({
            simAws: this.simAws,
            resources: this.resources,
          });
        }),
      );

      pendingResources = new Set(
        [...pendingResources].filter((resource) => {
          return !resource.createComplete;
        }),
      );
    }

    this._status = "CREATE_COMPLETE";
  }

  private recordTemplateResources(): void {
    const resources = this.template["Resources"];

    if (!isRecord(resources)) {
      return;
    }

    for (const [logicalId, resourceTemplate] of Object.entries(resources)) {
      /* v8 ignore if -- safety catch */
      if (!isRecord(resourceTemplate)) {
        continue;
      }

      this.resources.set(
        logicalId,
        new SimCfnResource({
          accountRegionScope: this.accountRegionScope,
          background: this.background,
          logicalId,
          template: this.resolveTemplateParameterRefs(resourceTemplate),
        }),
      );
    }
  }

  private resolveParameterValues(
    parameterOverrides: SimCloudFormationParameterValues,
  ): SimCloudFormationParameterValues {
    const templateParameters = this.template["Parameters"];
    const resolvedParameters: SimCloudFormationParameterValues = {
      ...parameterOverrides,
    };

    if (templateParameters === undefined) {
      return resolvedParameters;
    }

    if (!isRecord(templateParameters)) {
      throw new Error(
        `Sim CloudFormation Stack ${this.stackName} Parameters must be an object`,
      );
    }

    for (const [parameterName, parameterDefinition] of Object.entries(
      templateParameters,
    )) {
      if (resolvedParameters[parameterName] !== undefined) {
        continue;
      }

      if (!isRecord(parameterDefinition)) {
        throw new Error(
          `Sim CloudFormation Stack ${this.stackName} parameter ${parameterName} definition must be an object`,
        );
      }

      const defaultValue = parameterDefinition["Default"];

      if (typeof defaultValue === "string") {
        resolvedParameters[parameterName] = defaultValue;
      }
    }

    return resolvedParameters;
  }

  private resolveTemplateParameterRefs(
    value: Record<string, unknown>,
  ): Record<string, unknown>;
  private resolveTemplateParameterRefs(value: unknown): unknown;
  private resolveTemplateParameterRefs(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveTemplateParameterRefs(item));
    }

    if (!isRecord(value)) {
      return value;
    }

    const ref = value["Ref"];

    if (typeof ref === "string" && this.hasTemplateParameter(ref)) {
      const parameterValue = this.parameters[ref];

      if (parameterValue === undefined) {
        throw new Error(
          `Sim CloudFormation Stack ${this.stackName} parameter ${ref} is missing a value`,
        );
      }

      return parameterValue;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        this.resolveTemplateParameterRefs(entryValue),
      ]),
    );
  }

  private hasTemplateParameter(parameterName: string): boolean {
    const templateParameters = this.template["Parameters"];

    return isRecord(templateParameters) && parameterName in templateParameters;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
