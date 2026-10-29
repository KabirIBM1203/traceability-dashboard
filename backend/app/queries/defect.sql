-- Single defect detail for any JIRA project (DBBT, DMD0, etc.)
-- Parameterised by issue key (?).

WITH defect_issues AS (
    SELECT
        i.id,
        i.key,
        i.summary,
        i.status,
        i.updated
    FROM heiaepgdt09pwe01.silver_jira.issue i
    WHERE (i._fivetran_deleted = false OR i._fivetran_deleted IS NULL)
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
            'Workstream',
            'DBB Request type',
            'Requesting OpCo',
            'OpCo impacted',
            'Region & OpCo',
            'RevTrac Request'
      )
),

-- 'Region & OpCo' is multi-select — aggregate all active values per issue
region_opco AS (
    SELECT
        ifh.issue_id,
        array_join(
            sort_array(collect_set(COALESCE(fo.name, ifh.value))),
            ', '
        ) AS region_opco
    FROM heiaepgdt09pwe01.silver_jira.issue_field_history ifh
    INNER JOIN heiaepgdt09pwe01.silver_jira.field f
        ON ifh.field_id = f.id
    LEFT JOIN heiaepgdt09pwe01.silver_jira.field_option fo
        ON TRY_CAST(ifh.value AS BIGINT) = fo.id
    WHERE ifh.is_active = true
      AND f.name = 'Region & OpCo'
      AND ifh.value IS NOT NULL
    GROUP BY ifh.issue_id
),

fix_versions AS (
    SELECT
        imh.issue_id,
        array_join(
            sort_array(collect_set(v.name)),
            ', '
        ) AS fix_version
    FROM heiaepgdt09pwe01.silver_jira.issue_multiselect_history imh
    INNER JOIN heiaepgdt09pwe01.silver_jira.version v
        ON imh.value = CAST(v.id AS STRING)
    WHERE imh.field_id = 'fixVersions'
      AND imh.is_active = true
    GROUP BY imh.issue_id
)

SELECT

    di.key AS issue_key,

    MAX(CASE
        WHEN fld.field_name = 'ServiceNow Id'
        THEN fld.field_value
    END) AS ritm,

    s.name AS status,

    di.summary,

    COALESCE(
        MAX(CASE WHEN fld.field_name = 'Stream'      THEN fld.field_value END),
        MAX(CASE WHEN fld.field_name = 'Workstream'  THEN fld.field_value END),
        MAX(CASE WHEN fld.field_name = 'Work Stream' THEN fld.field_value END),
        MAX(CASE WHEN fld.field_name = 'Team'        THEN fld.field_value END)
    ) AS stream,

    MAX(CASE
        WHEN fld.field_name = 'DBB Request type'
        THEN fld.field_value
    END) AS request_type,

    COALESCE(
        MAX(CASE WHEN fld.field_name = 'OpCo impacted'   THEN fld.field_value END),
        MAX(CASE WHEN fld.field_name = 'Requesting OpCo' THEN fld.field_value END),
        ro.region_opco
    ) AS opco,

    MAX(CASE
        WHEN fld.field_name = 'RevTrac Request'
        THEN fld.field_value
    END) AS revtrac_request,

    fv.fix_version,

    di.updated

FROM defect_issues di

LEFT JOIN dashboard_fields fld
    ON di.id = fld.issue_id

LEFT JOIN region_opco ro
    ON di.id = ro.issue_id

LEFT JOIN heiaepgdt09pwe01.silver_jira.status s
    ON di.status = s.id

LEFT JOIN fix_versions fv
    ON di.id = fv.issue_id

WHERE UPPER(di.key) = UPPER(?)

GROUP BY
    di.key,
    di.summary,
    s.name,
    fv.fix_version,
    ro.region_opco,
    di.updated

LIMIT 1
