import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../sim-cfn-resource.js";

export interface SimCfnServiceResourceFactory {
  create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined>;
}

export interface SimCloudFormationParsedResourceType {
  readonly providerName: string;
  readonly serviceName: string;
  readonly resourceTypeName: string;
}
