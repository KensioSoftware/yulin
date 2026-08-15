import type {
  SimEcsEphemeralStorage,
  SimEcsProxyConfiguration,
  SimEcsRuntimePlatform,
  SimEcsTaskDefinitionPlacementConstraint,
  SimEcsVolume,
} from "./sim-ecs-task-definition-parts.js";

/**
 * What a task definition declares besides its family and its containers.
 *
 * These are the settings a described task definition reports back. A running
 * task acts on the two Roles, and every other setting is held as the
 * registration declared it. A setting that is not one of these is refused at
 * the command rather than held, so nothing a registration declared goes
 * missing from the revision it made.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_RegisterTaskDefinition.html
 */
export interface SimEcsTaskDefinitionSettingsType {
  readonly taskRoleArn?: string | undefined;
  readonly executionRoleArn?: string | undefined;
  readonly networkMode?: string | undefined;
  readonly cpu?: string | undefined;
  readonly memory?: string | undefined;
  readonly requiresCompatibilities?: readonly string[] | undefined;
  readonly volumes?: readonly SimEcsVolume[] | undefined;
  readonly placementConstraints?:
    | readonly SimEcsTaskDefinitionPlacementConstraint[]
    | undefined;
  readonly runtimePlatform?: SimEcsRuntimePlatform | undefined;
  readonly ephemeralStorage?: SimEcsEphemeralStorage | undefined;
  readonly proxyConfiguration?: SimEcsProxyConfiguration | undefined;
  readonly pidMode?: string | undefined;
  readonly ipcMode?: string | undefined;
}

/**
 * The names of the settings a registration may declare.
 *
 * The command refuses anything else, so this list is also what makes an
 * unmodelled setting a refusal rather than a silent omission.
 */
export const simEcsTaskDefinitionSettingNames: readonly string[] = [
  "taskRoleArn",
  "executionRoleArn",
  "networkMode",
  "cpu",
  "memory",
  "requiresCompatibilities",
  "volumes",
  "placementConstraints",
  "runtimePlatform",
  "ephemeralStorage",
  "proxyConfiguration",
  "pidMode",
  "ipcMode",
];

/**
 * The settings a simulated task definition was registered with.
 *
 * They are copied out of the request rather than held by reference, so a
 * described revision reports what the registration said at the time it was
 * made even where the caller reuses its input object for the next one.
 *
 * Only what the request set is reported. A revision registered without a
 * setting describes without it, rather than describing it as whatever value
 * real ECS would have defaulted it to, which would be a value this simulation
 * made up.
 */
export class SimEcsTaskDefinitionSettings {
  private readonly settings: SimEcsTaskDefinitionSettingsType;

  constructor(declared: SimEcsTaskDefinitionSettingsType) {
    this.settings = structuredClone({
      ...SimEcsTaskDefinitionSettings.declaredText(declared),
      ...SimEcsTaskDefinitionSettings.declaredStructures(declared),
    });
  }

  private static declaredText(
    declared: SimEcsTaskDefinitionSettingsType,
  ): SimEcsTaskDefinitionSettingsType {
    return {
      ...(declared.taskRoleArn !== undefined && {
        taskRoleArn: declared.taskRoleArn,
      }),
      ...(declared.executionRoleArn !== undefined && {
        executionRoleArn: declared.executionRoleArn,
      }),
      ...(declared.networkMode !== undefined && {
        networkMode: declared.networkMode,
      }),
      ...(declared.cpu !== undefined && { cpu: declared.cpu }),
      ...(declared.memory !== undefined && { memory: declared.memory }),
      ...(declared.pidMode !== undefined && { pidMode: declared.pidMode }),
      ...(declared.ipcMode !== undefined && { ipcMode: declared.ipcMode }),
    };
  }

  private static declaredStructures(
    declared: SimEcsTaskDefinitionSettingsType,
  ): SimEcsTaskDefinitionSettingsType {
    return {
      ...(declared.requiresCompatibilities !== undefined && {
        requiresCompatibilities: declared.requiresCompatibilities,
      }),
      ...(declared.volumes !== undefined && { volumes: declared.volumes }),
      ...(declared.placementConstraints !== undefined && {
        placementConstraints: declared.placementConstraints,
      }),
      ...(declared.runtimePlatform !== undefined && {
        runtimePlatform: declared.runtimePlatform,
      }),
      ...(declared.ephemeralStorage !== undefined && {
        ephemeralStorage: declared.ephemeralStorage,
      }),
      ...(declared.proxyConfiguration !== undefined && {
        proxyConfiguration: declared.proxyConfiguration,
      }),
    };
  }

  /**
   * The Role a task made from this definition attributes its AWS calls to.
   *
   * A definition declaring none leaves a running task unattributed, as a real
   * task without a task role has no credentials of its own.
   */
  get taskRoleArn(): string | undefined {
    return this.settings.taskRoleArn;
  }

  /**
   * The Role a task made from this definition pulls its container secrets as.
   *
   * It is deliberately not the task Role. Real ECS reads a container's
   * `secrets` with the execution Role while the task is still provisioning,
   * and attributes what the container itself does to the task Role, so a
   * policy allowing one grants nothing to the other.
   */
  get executionRoleArn(): string | undefined {
    return this.settings.executionRoleArn;
  }

  /**
   * These settings as a described task definition reports them.
   */
  toOutput(): SimEcsTaskDefinitionSettingsType {
    return structuredClone(this.settings);
  }
}
