/**
 * Minimal structural sim ECS tag.
 *
 * ECS tags carry lowercase `key` and `value`, unlike most AWS services.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Tag.html
 */
export interface SimEcsTag {
  readonly key?: string | undefined;
  readonly value?: string | undefined;
}

/**
 * Minimal structural sim ECS volume host path.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_HostVolumeProperties.html
 */
export interface SimEcsHostVolumeProperties {
  readonly sourcePath?: string | undefined;
}

/**
 * Minimal structural sim ECS task definition volume.
 *
 * The driver-specific configurations are kept as declared rather than named
 * field by field, because nothing here mounts anything.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Volume.html
 */
export interface SimEcsVolume {
  readonly name?: string | undefined;
  readonly host?: SimEcsHostVolumeProperties | undefined;
  readonly configuredAtLaunch?: boolean | undefined;
  readonly dockerVolumeConfiguration?: object | undefined;
  readonly efsVolumeConfiguration?: object | undefined;
}

/**
 * Minimal structural sim ECS task placement constraint.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_TaskDefinitionPlacementConstraint.html
 */
export interface SimEcsTaskDefinitionPlacementConstraint {
  readonly type?: string | undefined;
  readonly expression?: string | undefined;
}

/**
 * Minimal structural sim ECS runtime platform.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_RuntimePlatform.html
 */
export interface SimEcsRuntimePlatform {
  readonly cpuArchitecture?: string | undefined;
  readonly operatingSystemFamily?: string | undefined;
}

/**
 * Minimal structural sim ECS ephemeral storage.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_EphemeralStorage.html
 */
export interface SimEcsEphemeralStorage {
  readonly sizeInGiB?: number | undefined;
}

/**
 * Minimal structural sim ECS proxy configuration.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ProxyConfiguration.html
 */
export interface SimEcsProxyConfiguration {
  readonly type?: string | undefined;
  readonly containerName?: string | undefined;
  readonly properties?: readonly object[] | undefined;
}
