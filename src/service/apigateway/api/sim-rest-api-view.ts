import type { SimRestApi } from "./sim-rest-api.js";

/**
 * Minimal structural REST API view, as the Create and Get commands return.
 */
export interface SimRestApiView {
  id: string;
  name: string;
  createdDate: Date;
  rootResourceId: string;
  disableExecuteApiEndpoint: boolean;
  description?: string;
}

/**
 * Build the AWS-like view of a REST API.
 *
 * The creation time is copied, since a Date is mutable and a caller holding
 * the stored one could change when the API says it was created.
 */
export function simRestApiView(restApi: SimRestApi): SimRestApiView {
  const view: SimRestApiView = {
    id: restApi.apiId,
    name: restApi.name,
    createdDate: new Date(restApi.createdDate),
    rootResourceId: restApi.rootResource.resourceId,
    disableExecuteApiEndpoint: restApi.disableExecuteApiEndpoint,
    ...(restApi.description !== undefined && {
      description: restApi.description,
    }),
  };

  return view;
}
