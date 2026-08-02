/**
 * The only protocol type simulated. WebSocket APIs are a different service
 * shape behind the same API, and none of it is modelled here.
 */
export type SimHttpApiProtocolType = "HTTP";

/**
 * Minimal structural API view, as the Create and Get commands return.
 */
export interface SimHttpApiView {
  ApiId: string;
  ApiEndpoint: string;
  Name: string;
  ProtocolType: SimHttpApiProtocolType;
  CreatedDate: Date;
  DisableExecuteApiEndpoint: boolean;
  Description?: string;
}

/**
 * What the view is built from, which one simulated API satisfies.
 */
interface SimHttpApiViewParts {
  readonly apiId: string;
  readonly apiEndpoint: string;
  readonly name: string;
  readonly protocolType: SimHttpApiProtocolType;
  readonly createdDate: Date;
  readonly disableExecuteApiEndpoint: boolean;
  readonly description?: string | undefined;
}

/**
 * Build the AWS-like view of one API.
 *
 * A description is left out rather than reported as empty, in the same way
 * real API Gateway leaves out the field for an API created without one.
 */
export function simHttpApiView(parts: SimHttpApiViewParts): SimHttpApiView {
  const view: SimHttpApiView = {
    ApiId: parts.apiId,
    ApiEndpoint: parts.apiEndpoint,
    Name: parts.name,
    ProtocolType: parts.protocolType,
    CreatedDate: parts.createdDate,
    DisableExecuteApiEndpoint: parts.disableExecuteApiEndpoint,
  };

  if (parts.description !== undefined) {
    view.Description = parts.description;
  }

  return view;
}
