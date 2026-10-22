-- Batch lookup of DCRTB features for a set of tokens.
-- A token may be:
--   * a DCRTB key                          (the feature itself)
--   * any other JIRA key (CMD-, CTB-, ...) (resolved via its parent chain,
--                                           up to two levels, to the DCRTB
--                                           feature)
--   * a ServiceNow RITM                    (matched on the feature's
--                                           "ServiceNow Id")
-- __TOKENS__ is replaced in Python with a comma-separated list of "?" markers
-- and is bound exactly once.
-- depth = distance from the token's issue to the DCRTB feature (0 = itself).

WITH tokens AS (
    SELECT DISTINCT UPPER(t) AS token
    FROM (SELECT explode(array(__TOKENS__)) AS t)
),

dashboard_fields AS (
    SELECT
        ifh.issue_id,
        f.name AS field_name,
        COALESCE(fo.name, ifh.value) AS field_value
    FROM heiaepgdt09pwe01.silver_jira.issue_field_history ifh
    INNER JOIN heiaepgdt09pwe01.silver_jira.field f
        ON ifh.field_id = f.id
    LEFT JOIN heiaepgdt09pwe01.silver_jira.field_option fo
        ON TRY_CAST(ifh.value AS BIGINT) = fo.id
    WHERE ifh.is_active = true
      AND f.name IN ('ServiceNow Id', 'Stream', 'OpCo impacted', 'Requesting OpCo')
),

features AS (
    SELECT
        i.key     AS issue_key,
        s.name    AS status,
        i.summary,
        MAX(CASE WHEN fld.field_name = 'ServiceNow Id'   THEN fld.field_value END) AS ritm,
        MAX(CASE WHEN fld.field_name = 'Stream'          THEN fld.field_value END) AS stream,
        MAX(CASE WHEN fld.field_name = 'OpCo impacted'   THEN fld.field_value END) AS opco_impacted,
        MAX(CASE WHEN fld.field_name = 'Requesting OpCo' THEN fld.field_value END) AS requesting_opco
    FROM heiaepgdt09pwe01.silver_jira.issue i
    INNER JOIN heiaepgdt09pwe01.silver_jira.project p
        ON i.project = p.id
    LEFT JOIN heiaepgdt09pwe01.silver_jira.status s
        ON i.status = s.id
    LEFT JOIN dashboard_fields fld
        ON fld.issue_id = i.id
    WHERE p.key = 'DCRTB'
      AND (i._fivetran_deleted = false OR i._fivetran_deleted IS NULL)
    GROUP BY i.key, s.name, i.summary
),

src AS (
    SELECT i.id, i.key, i.parent_id, UPPER(i.key) AS token
    FROM heiaepgdt09pwe01.silver_jira.issue i
    INNER JOIN tokens t
        ON UPPER(i.key) = t.token
    WHERE i._fivetran_deleted = false OR i._fivetran_deleted IS NULL
),

-- token -> candidate DCRTB feature key (self, parent, grandparent)
lineage AS (
    SELECT s.token, s.key AS feature_key, 0 AS depth
    FROM src s

    UNION ALL

    SELECT s.token, p1.key, 1
    FROM src s
    INNER JOIN heiaepgdt09pwe01.silver_jira.issue p1
        ON s.parent_id = p1.id

    UNION ALL

    SELECT s.token, p2.key, 2
    FROM src s
    INNER JOIN heiaepgdt09pwe01.silver_jira.issue p1
        ON s.parent_id = p1.id
    INNER JOIN heiaepgdt09pwe01.silver_jira.issue p2
        ON p1.parent_id = p2.id
)

SELECT l.token AS matched_key, l.depth, f.*
FROM lineage l
INNER JOIN features f
    ON f.issue_key = l.feature_key

UNION ALL

SELECT UPPER(f.ritm) AS matched_key, 0 AS depth, f.*
FROM features f
INNER JOIN tokens t
    ON UPPER(f.ritm) = t.token
