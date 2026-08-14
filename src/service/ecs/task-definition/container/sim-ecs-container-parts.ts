/**
 * Minimal structural sim ECS key value pair, as used by `environment`.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_KeyValuePair.html
 */
export interface SimEcsKeyValuePair {
  readonly name?: string | undefined;
  readonly value?: string | undefined;
}

/**
 * Minimal structural sim ECS container secret.
 *
 * `valueFrom` names a Secrets Manager secret or an SSM parameter. Nothing
 * resolves it here, so the value is only ever the identifier the definition
 * declared.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Secret.html
 */
export interface SimEcsSecret {
  readonly name?: string | undefined;
  readonly valueFrom?: string | undefined;
}

/**
 * Minimal structural sim ECS port mapping.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_PortMapping.html
 */
export interface SimEcsPortMapping {
  readonly containerPort?: number | undefined;
  readonly hostPort?: number | undefined;
  readonly protocol?: string | undefined;
  readonly name?: string | undefined;
  readonly appProtocol?: string | undefined;
  readonly containerPortRange?: string | undefined;
}

/**
 * Minimal structural sim ECS container dependency.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ContainerDependency.html
 */
export interface SimEcsContainerDependency {
  readonly containerName?: string | undefined;
  readonly condition?: string | undefined;
}

/**
 * Minimal structural sim ECS container health check.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_HealthCheck.html
 */
export interface SimEcsHealthCheck {
  readonly command?: readonly string[] | undefined;
  readonly interval?: number | undefined;
  readonly timeout?: number | undefined;
  readonly retries?: number | undefined;
  readonly startPeriod?: number | undefined;
}

/**
 * Minimal structural sim ECS container log configuration.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_LogConfiguration.html
 */
export interface SimEcsLogConfiguration {
  readonly logDriver?: string | undefined;
  readonly options?: Readonly<Record<string, string>> | undefined;
  readonly secretOptions?: readonly SimEcsSecret[] | undefined;
}

/**
 * Minimal structural sim ECS ulimit.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Ulimit.html
 */
export interface SimEcsUlimit {
  readonly name?: string | undefined;
  readonly softLimit?: number | undefined;
  readonly hardLimit?: number | undefined;
}

/**
 * Minimal structural sim ECS mount point.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_MountPoint.html
 */
export interface SimEcsMountPoint {
  readonly sourceVolume?: string | undefined;
  readonly containerPath?: string | undefined;
  readonly readOnly?: boolean | undefined;
}
