import type { SimQueryFields } from "../../../../serve/http/api/query/sim-query-request.js";
import type { SimQueryOperations } from "../../../../serve/http/api/query/sim-query-operation.js";
import {
  elbV2QueryCertificateList,
  elbV2QueryCertificates,
} from "./sim-elbv2-query-certificate.js";
import { elbV2QueryPagingInput } from "./sim-elbv2-query-input.js";
import { elbV2QueryNextMarker } from "./sim-elbv2-query-result.js";

/**
 * The listener certificate operations simulated ELBv2 serves over the Query
 * protocol.
 *
 * These are how a listener gets more than one certificate. The first one is
 * the default and is given when the listener is created, and the rest are
 * added here for the hosts a load balancer answers for beyond it.
 */
export function simElbV2QueryListenerCertificateOperations(): SimQueryOperations {
  return new Map([
    [
      "AddListenerCertificates",
      {
        input: certificatesInput,
        result: elbV2QueryCertificateList,
      },
    ],
    [
      "RemoveListenerCertificates",
      {
        input: certificatesInput,
        result: (): string => "",
      },
    ],
    [
      "DescribeListenerCertificates",
      {
        input: (fields): Record<string, unknown> => ({
          ...elbV2QueryPagingInput(fields),
          ListenerArn: fields.text("ListenerArn"),
        }),
        result: (output): string =>
          elbV2QueryCertificateList(output) + elbV2QueryNextMarker(output),
      },
    ],
  ]);
}

function certificatesInput(fields: SimQueryFields): Record<string, unknown> {
  return {
    ListenerArn: fields.text("ListenerArn"),
    Certificates: elbV2QueryCertificates(fields),
  };
}
