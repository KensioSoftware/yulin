/**
 * Athena queries of the shapes a Yulin user would run in a test.
 *
 * Each carries a label naming the construct it exists to exercise, so a
 * failure names something rather than a line number.
 */
export interface CorpusQuery {
  readonly label: string;
  readonly sql: string;
}

export const /**
   *
   */
  corpus: readonly CorpusQuery[] = [
    {
      label: "select-star-limit",
      sql: `SELECT * FROM rainlytics.access_logs LIMIT 10`,
    },
    {
      label: "group-by-count-order",
      sql: `SELECT url, count(*) AS hits FROM rainlytics.access_logs GROUP BY 1 ORDER BY hits DESC LIMIT 10`,
    },
    {
      label: "where-comparison",
      sql: `SELECT count(*) AS errors FROM rainlytics.access_logs WHERE status >= 400`,
    },
    {
      label: "between",
      sql: `SELECT day, count(*) AS hits FROM rainlytics.access_logs WHERE day BETWEEN '2026-08-01' AND '2026-08-31' GROUP BY 1 ORDER BY 1`,
    },
    {
      label: "in-list",
      sql: `SELECT url FROM rainlytics.access_logs WHERE status IN (500, 502, 503)`,
    },
    {
      label: "like",
      sql: `SELECT count(*) AS api FROM rainlytics.access_logs WHERE url LIKE '/api/%'`,
    },
    {
      label: "distinct",
      sql: `SELECT DISTINCT url FROM rainlytics.access_logs`,
    },
    {
      label: "count-distinct",
      sql: `SELECT count(DISTINCT ip) AS visitors FROM rainlytics.access_logs`,
    },
    {
      label: "aggregates",
      sql: `SELECT min(bytes) AS lo, max(bytes) AS hi, avg(bytes) AS mean, sum(bytes) AS total FROM rainlytics.access_logs`,
    },
    {
      label: "having",
      sql: `SELECT url, count(*) AS hits FROM rainlytics.access_logs GROUP BY 1 HAVING count(*) > 1`,
    },
    {
      label: "case-when",
      sql: `SELECT CASE WHEN status >= 500 THEN 'server' WHEN status >= 400 THEN 'client' ELSE 'ok' END AS band, count(*) AS hits FROM rainlytics.access_logs GROUP BY 1`,
    },
    {
      label: "coalesce",
      sql: `SELECT coalesce(ip, 'unknown') AS ip FROM rainlytics.access_logs`,
    },
    {
      label: "arithmetic",
      sql: `SELECT sum(bytes) / count(*) AS mean_bytes FROM rainlytics.access_logs`,
    },
    {
      label: "string-functions",
      sql: `SELECT lower(url) AS u, length(url) AS n FROM rainlytics.access_logs`,
    },
    {
      label: "concat-operator",
      sql: `SELECT url || '?' AS u FROM rainlytics.access_logs`,
    },
    {
      label: "cte",
      sql: `WITH errors AS (SELECT url, bytes FROM rainlytics.access_logs WHERE status >= 400) SELECT url, sum(bytes) AS total FROM errors GROUP BY 1`,
    },
    {
      label: "inner-join",
      sql: `SELECT c.name, count(*) AS orders FROM shop.orders o JOIN shop.customers c ON o.customer_id = c.id GROUP BY 1`,
    },
    {
      label: "left-join",
      sql: `SELECT c.name, o.total FROM shop.customers c LEFT JOIN shop.orders o ON o.customer_id = c.id`,
    },
    {
      label: "subquery-from",
      sql: `SELECT t.url FROM (SELECT url FROM rainlytics.access_logs WHERE status = 404) t`,
    },
    {
      label: "subquery-in",
      sql: `SELECT name FROM shop.customers WHERE id IN (SELECT customer_id FROM shop.orders)`,
    },
    {
      label: "not-exists",
      sql: `SELECT name FROM shop.customers c WHERE NOT EXISTS (SELECT 1 FROM shop.orders o WHERE o.customer_id = c.id)`,
    },
    {
      label: "union-all",
      sql: `SELECT url FROM rainlytics.access_logs WHERE status = 404 UNION ALL SELECT url FROM rainlytics.access_logs WHERE status = 500`,
    },
    {
      label: "window-row-number",
      sql: `SELECT id, row_number() OVER (PARTITION BY customer_id ORDER BY placed_at DESC) AS rn FROM shop.orders`,
    },
    {
      label: "window-sum",
      sql: `SELECT id, sum(total) OVER (PARTITION BY customer_id) AS customer_total FROM shop.orders`,
    },
    {
      label: "cast",
      sql: `SELECT CAST(bytes AS DOUBLE) AS b FROM rainlytics.access_logs`,
    },
    {
      label: "try-cast",
      sql: `SELECT try_cast(status AS VARCHAR) AS s FROM rainlytics.access_logs`,
    },
    {
      label: "date-trunc",
      sql: `SELECT date_trunc('day', from_iso8601_timestamp(ts)) AS d, count(*) AS hits FROM rainlytics.access_logs GROUP BY 1 ORDER BY 1`,
    },
    {
      label: "date-format",
      sql: `SELECT date_format(from_iso8601_timestamp(ts), '%Y-%m') AS month FROM rainlytics.access_logs`,
    },
    {
      label: "date-literal",
      sql: `SELECT count(*) AS recent FROM shop.orders WHERE placed_at > DATE '2026-01-01'`,
    },
    { label: "from-unixtime", sql: `SELECT from_unixtime(1767225600) AS t` },
    {
      label: "approx-distinct",
      sql: `SELECT url, approx_distinct(ip) AS visitors FROM rainlytics.access_logs GROUP BY 1`,
    },
    {
      label: "approx-percentile",
      sql: `SELECT approx_percentile(bytes, 0.95) AS p95 FROM rainlytics.access_logs`,
    },
    {
      label: "json-extract-scalar",
      sql: `SELECT json_extract_scalar(payload, '$.user.id') AS user_id FROM app.events`,
    },
    {
      label: "regexp-like",
      sql: `SELECT count(*) AS api FROM rainlytics.access_logs WHERE regexp_like(url, '^/api/')`,
    },
    {
      label: "split-part",
      sql: `SELECT split_part(url, '/', 2) AS first_segment FROM rainlytics.access_logs`,
    },
    {
      label: "cardinality",
      sql: `SELECT cardinality(tags) AS n FROM app.events`,
    },
    {
      label: "element-at",
      sql: `SELECT element_at(attrs, 'source') AS source FROM app.events`,
    },
    {
      label: "unnest",
      sql: `SELECT e.id, t.tag FROM app.events e CROSS JOIN UNNEST(tags) AS t(tag)`,
    },
    {
      label: "grouping-sets",
      sql: `SELECT url, status, count(*) AS hits FROM rainlytics.access_logs GROUP BY GROUPING SETS ((url), (status))`,
    },
    {
      label: "offset",
      sql: `SELECT url FROM rainlytics.access_logs ORDER BY url OFFSET 2 LIMIT 5`,
    },
  ];
