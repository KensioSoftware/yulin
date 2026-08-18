import type { SimQueryOperations } from "../../../../serve/http/api/query/sim-query-operation.js";
import type { SimQueryOutput } from "../../../../serve/http/api/query/sim-query-result.js";
import {
  queryList,
  queryMembers,
} from "../../../../serve/http/api/query/sim-query-result.js";
import {
  elbV2QueryActionMembers,
  elbV2QueryActions,
} from "./sim-elbv2-query-action.js";
import {
  elbV2QueryCertificateList,
  elbV2QueryCertificates,
} from "./sim-elbv2-query-certificate.js";
import {
  elbV2QueryNumber,
  elbV2QueryPagingInput,
  elbV2QueryTags,
  elbV2QueryValues,
} from "./sim-elbv2-query-input.js";
import { elbV2QueryNextMarker } from "./sim-elbv2-query-result.js";

/**
 * The members ELB describes one listener with.
 */
const listenerMembers = [
  "ListenerArn",
  "LoadBalancerArn",
  "Port",
  "Protocol",
  "SslPolicy",
];

/**
 * The listener operations simulated ELBv2 serves over the Query protocol.
 */
export function simElbV2QueryListenerOperations(): SimQueryOperations {
  return new Map([
    [
      "CreateListener",
      {
        input: (fields): Record<string, unknown> => ({
          LoadBalancerArn: fields.text("LoadBalancerArn"),
          Protocol: fields.text("Protocol"),
          Port: elbV2QueryNumber(fields, "Port"),
          SslPolicy: fields.text("SslPolicy"),
          Certificates: elbV2QueryCertificates(fields),
          DefaultActions: elbV2QueryActions(fields, "DefaultActions"),
          Tags: elbV2QueryTags(fields),
        }),
        result: listenerListing,
      },
    ],
    [
      "DescribeListeners",
      {
        input: (fields): Record<string, unknown> => ({
          ...elbV2QueryPagingInput(fields),
          LoadBalancerArn: fields.text("LoadBalancerArn"),
          ListenerArns: elbV2QueryValues(fields, "ListenerArns"),
        }),
        result: (output): string =>
          listenerListing(output) + elbV2QueryNextMarker(output),
      },
    ],
    [
      "ModifyListener",
      {
        input: (fields): Record<string, unknown> => ({
          ListenerArn: fields.text("ListenerArn"),
          Protocol: fields.text("Protocol"),
          Port: elbV2QueryNumber(fields, "Port"),
          SslPolicy: fields.text("SslPolicy"),
          Certificates: elbV2QueryCertificates(fields),
          DefaultActions: elbV2QueryActions(fields, "DefaultActions"),
        }),
        result: listenerListing,
      },
    ],
    [
      "DeleteListener",
      {
        input: (fields): Record<string, unknown> => ({
          ListenerArn: fields.text("ListenerArn"),
        }),
        result: (): string => "",
      },
    ],
  ]);
}

function listenerListing(output: SimQueryOutput): string {
  return queryList(
    output,
    "Listeners",
    (listener) =>
      queryMembers(listener, listenerMembers) +
      elbV2QueryCertificateList(listener) +
      queryList(listener, "DefaultActions", elbV2QueryActionMembers),
  );
}
