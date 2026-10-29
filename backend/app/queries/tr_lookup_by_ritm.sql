-- Batch lookup of features/defects for a set of tokens across ALL JIRA projects.
-- A token may be:
--   * any JIRA issue key (DCRTB-, DBBT-, DMD0-, CMD-, CTB-, CD1-, DRC-, PHOENIX-,
--     PRICINGPRO-, ASAPIO-, ESSRM-, ...) resolved via its parent chain (up to two
--     levels) to the root issue that carries a ServiceNow Id (RITM)
--   * a ServiceNow RITM matched directly on the 'ServiceNow Id' field
-- __TOKENS__ is replaced in Python with comma-separated "?" markers.
-- depth = hops from the token's issue to the matched root issue (0 = itself).

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
      AND f.name IN (
            'ServiceNow Id',
            'Stream',
            'Workstream'
      )
),

-- All three OpCo fields are multi-select.
-- Read from BOTH issue_field_history (field option ID → name via field_option)
-- AND issue_multiselect_history (plain string values stored directly).
-- Union them so neither storage pattern is missed.
opco_impacted AS (
    SELECT issue_id,
           array_join(sort_array(collect_set(val)), ', ') AS opco_impacted
    FROM (
        -- stored as a field_option numeric ID
        SELECT ifh.issue_id, COALESCE(fo.name, ifh.value) AS val
        FROM heiaepgdt09pwe01.silver_jira.issue_field_history ifh
        INNER JOIN heiaepgdt09pwe01.silver_jira.field f ON ifh.field_id = f.id
        LEFT JOIN heiaepgdt09pwe01.silver_jira.field_option fo
            ON TRY_CAST(ifh.value AS BIGINT) = fo.id
        WHERE ifh.is_active = true AND f.name = 'OpCo impacted'
          AND ifh.value IS NOT NULL
        UNION ALL
        -- stored as a plain string in issue_multiselect_history
        SELECT imh.issue_id, fo2.name AS val
        FROM heiaepgdt09pwe01.silver_jira.issue_multiselect_history imh
        INNER JOIN heiaepgdt09pwe01.silver_jira.field f2 ON imh.field_id = f2.id
        INNER JOIN heiaepgdt09pwe01.silver_jira.field_option fo2
            ON TRY_CAST(imh.value AS BIGINT) = fo2.id
        WHERE imh.is_active = true AND f2.name = 'OpCo impacted'
          AND imh.value IS NOT NULL
    )
    WHERE val IS NOT NULL AND trim(val) <> ''
    GROUP BY issue_id
),

requesting_opco AS (
    SELECT issue_id,
           array_join(sort_array(collect_set(val)), ', ') AS requesting_opco
    FROM (
        SELECT ifh.issue_id, COALESCE(fo.name, ifh.value) AS val
        FROM heiaepgdt09pwe01.silver_jira.issue_field_history ifh
        INNER JOIN heiaepgdt09pwe01.silver_jira.field f ON ifh.field_id = f.id
        LEFT JOIN heiaepgdt09pwe01.silver_jira.field_option fo
            ON TRY_CAST(ifh.value AS BIGINT) = fo.id
        WHERE ifh.is_active = true AND f.name = 'Requesting OpCo'
          AND ifh.value IS NOT NULL
        UNION ALL
        SELECT imh.issue_id, fo2.name AS val
        FROM heiaepgdt09pwe01.silver_jira.issue_multiselect_history imh
        INNER JOIN heiaepgdt09pwe01.silver_jira.field f2 ON imh.field_id = f2.id
        INNER JOIN heiaepgdt09pwe01.silver_jira.field_option fo2
            ON TRY_CAST(imh.value AS BIGINT) = fo2.id
        WHERE imh.is_active = true AND f2.name = 'Requesting OpCo'
          AND imh.value IS NOT NULL
    )
    WHERE val IS NOT NULL AND trim(val) <> ''
    GROUP BY issue_id
),

region_opco AS (
    SELECT issue_id,
           array_join(sort_array(collect_set(val)), ', ') AS region_opco
    FROM (
        SELECT ifh.issue_id, COALESCE(fo.name, ifh.value) AS val
        FROM heiaepgdt09pwe01.silver_jira.issue_field_history ifh
        INNER JOIN heiaepgdt09pwe01.silver_jira.field f ON ifh.field_id = f.id
        LEFT JOIN heiaepgdt09pwe01.silver_jira.field_option fo
            ON TRY_CAST(ifh.value AS BIGINT) = fo.id
        WHERE ifh.is_active = true AND f.name = 'Region & OpCo'
          AND ifh.value IS NOT NULL
        UNION ALL
        SELECT imh.issue_id, fo2.name AS val
        FROM heiaepgdt09pwe01.silver_jira.issue_multiselect_history imh
        INNER JOIN heiaepgdt09pwe01.silver_jira.field f2 ON imh.field_id = f2.id
        INNER JOIN heiaepgdt09pwe01.silver_jira.field_option fo2
            ON TRY_CAST(imh.value AS BIGINT) = fo2.id
        WHERE imh.is_active = true AND f2.name = 'Region & OpCo'
          AND imh.value IS NOT NULL
    )
    WHERE val IS NOT NULL AND trim(val) <> ''
    GROUP BY issue_id
),

-- All issues across all projects that carry a ServiceNow Id (RITM) or that
-- are themselves a known defect/feature type worth surfacing.
features AS (
    SELECT
        i.key       AS issue_key,
        p.key       AS project_key,
        s.name      AS status,
        i.summary,
        MAX(CASE WHEN fld.field_name = 'ServiceNow Id' THEN fld.field_value END) AS ritm,
        COALESCE(
            MAX(CASE WHEN fld.field_name = 'Stream'     THEN fld.field_value END),
            MAX(CASE WHEN fld.field_name = 'Workstream' THEN fld.field_value END)
        ) AS stream,
        -- Merge all three OpCo sources into one deduplicated comma-separated string.
        -- Each source already has collect_set applied; split + flatten + distinct here.
        NULLIF(
            array_join(
                sort_array(
                    array_distinct(
                        flatten(array(
                            CASE WHEN oi.opco_impacted    IS NOT NULL
                                 THEN split(oi.opco_impacted,   ', ') ELSE array() END,
                            CASE WHEN rqo.requesting_opco IS NOT NULL
                                 THEN split(rqo.requesting_opco,', ') ELSE array() END,
                            CASE WHEN ro.region_opco      IS NOT NULL
                                 THEN split(ro.region_opco,    ', ') ELSE array() END
                        ))
                    )
                ),
                ', '
            ),
        '') AS opco
    FROM heiaepgdt09pwe01.silver_jira.issue i
    INNER JOIN heiaepgdt09pwe01.silver_jira.project p
        ON i.project = p.id
    LEFT JOIN heiaepgdt09pwe01.silver_jira.status s
        ON i.status = s.id
    LEFT JOIN dashboard_fields fld
        ON fld.issue_id = i.id
    LEFT JOIN opco_impacted oi
        ON oi.issue_id = i.id
    LEFT JOIN requesting_opco rqo
        ON rqo.issue_id = i.id
    LEFT JOIN region_opco ro
        ON ro.issue_id = i.id
    WHERE (i._fivetran_deleted = false OR i._fivetran_deleted IS NULL)
    GROUP BY i.key, p.key, s.name, i.summary,
             oi.opco_impacted, rqo.requesting_opco, ro.region_opco
),

-- For every issue, compute the best OpCo walking up the parent chain (up to 2 levels).
-- Used as fallback when the matched issue itself has no OpCo.
parent_opco AS (
    SELECT
        i.id AS issue_id,
        NULLIF(
            array_join(
                sort_array(
                    array_distinct(
                        flatten(array(
                            -- parent OpCo
                            CASE WHEN p1_oi.opco_impacted  IS NOT NULL
                                 THEN split(p1_oi.opco_impacted,  ', ') ELSE array() END,
                            CASE WHEN p1_rqo.requesting_opco IS NOT NULL
                                 THEN split(p1_rqo.requesting_opco,', ') ELSE array() END,
                            CASE WHEN p1_ro.region_opco IS NOT NULL
                                 THEN split(p1_ro.region_opco,    ', ') ELSE array() END,
                            -- grandparent OpCo
                            CASE WHEN p2_oi.opco_impacted  IS NOT NULL
                                 THEN split(p2_oi.opco_impacted,  ', ') ELSE array() END,
                            CASE WHEN p2_rqo.requesting_opco IS NOT NULL
                                 THEN split(p2_rqo.requesting_opco,', ') ELSE array() END,
                            CASE WHEN p2_ro.region_opco IS NOT NULL
                                 THEN split(p2_ro.region_opco,    ', ') ELSE array() END
                        ))
                    )
                ),
                ', '
            ),
        '') AS inherited_opco
    FROM heiaepgdt09pwe01.silver_jira.issue i
    -- parent
    LEFT JOIN heiaepgdt09pwe01.silver_jira.issue p1 ON p1.id = i.parent_id
    LEFT JOIN opco_impacted   p1_oi  ON p1_oi.issue_id  = p1.id
    LEFT JOIN requesting_opco p1_rqo ON p1_rqo.issue_id = p1.id
    LEFT JOIN region_opco     p1_ro  ON p1_ro.issue_id  = p1.id
    -- grandparent
    LEFT JOIN heiaepgdt09pwe01.silver_jira.issue p2 ON p2.id = p1.parent_id
    LEFT JOIN opco_impacted   p2_oi  ON p2_oi.issue_id  = p2.id
    LEFT JOIN requesting_opco p2_rqo ON p2_rqo.issue_id = p2.id
    LEFT JOIN region_opco     p2_ro  ON p2_ro.issue_id  = p2.id
    WHERE (i._fivetran_deleted = false OR i._fivetran_deleted IS NULL)
),

src AS (
    SELECT i.id, i.key, i.parent_id, UPPER(i.key) AS token
    FROM heiaepgdt09pwe01.silver_jira.issue i
    INNER JOIN tokens t
        ON UPPER(i.key) = t.token
    WHERE i._fivetran_deleted = false OR i._fivetran_deleted IS NULL
),

-- token -> candidate root issue key (self, parent, grandparent)
-- Joins features on any project so CD1, DBBT, DMD0, DRC, PHOENIX etc. all resolve
lineage AS (
    SELECT s.token, s.key AS feature_key, s.id AS feature_id, 0 AS depth
    FROM src s

    UNION ALL

    SELECT s.token, p1.key, p1.id, 1
    FROM src s
    INNER JOIN heiaepgdt09pwe01.silver_jira.issue p1
        ON s.parent_id = p1.id

    UNION ALL

    SELECT s.token, p2.key, p2.id, 2
    FROM src s
    INNER JOIN heiaepgdt09pwe01.silver_jira.issue p1
        ON s.parent_id = p1.id
    INNER JOIN heiaepgdt09pwe01.silver_jira.issue p2
        ON p1.parent_id = p2.id
)

-- Match via issue key lineage — use parent/grandparent OpCo when feature has none
SELECT
    l.token AS matched_key,
    l.depth,
    f.issue_key,
    f.project_key,
    f.status,
    f.summary,
    f.ritm,
    f.stream,
    COALESCE(NULLIF(f.opco,''), po.inherited_opco) AS opco
FROM lineage l
INNER JOIN features f ON f.issue_key = l.feature_key
LEFT JOIN parent_opco po ON po.issue_id = l.feature_id

UNION ALL

-- Match via RITM directly — use parent/grandparent OpCo when feature has none
SELECT
    UPPER(f.ritm) AS matched_key,
    0 AS depth,
    f.issue_key,
    f.project_key,
    f.status,
    f.summary,
    f.ritm,
    f.stream,
    COALESCE(NULLIF(f.opco,''), po.inherited_opco) AS opco
FROM features f
INNER JOIN tokens t ON UPPER(f.ritm) = t.token
LEFT JOIN heiaepgdt09pwe01.silver_jira.issue i ON i.key = f.issue_key
LEFT JOIN parent_opco po ON po.issue_id = i.id
WHERE f.ritm IS NOT NULL
