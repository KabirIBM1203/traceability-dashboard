WITH dcrtb_features AS (
    SELECT
        i.id,
        i.key,
        i.summary,
        i.status,
        i.updated
    FROM heiaepgdt09pwe01.silver_jira.issue i
    INNER JOIN heiaepgdt09pwe01.silver_jira.project p
        ON i.project = p.id
    INNER JOIN heiaepgdt09pwe01.silver_jira.issue_type it
        ON i.issue_type = it.id
    WHERE p.key = 'DCRTB'
      AND it.name = 'Feature'
      AND (i._fivetran_deleted = false OR i._fivetran_deleted IS NULL)
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
            'DBB Request type',
            'Requesting OpCo',
            'OpCo impacted',
            'RevTrac Request'
      )
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

    df.key AS issue_key,

    MAX(CASE
        WHEN fld.field_name = 'ServiceNow Id'
        THEN fld.field_value
    END) AS ritm,

    s.name AS status,

    df.summary,

    MAX(CASE
        WHEN fld.field_name = 'Stream'
        THEN fld.field_value
    END) AS stream,

    MAX(CASE
        WHEN fld.field_name = 'DBB Request type'
        THEN fld.field_value
    END) AS request_type,

    MAX(CASE
        WHEN fld.field_name = 'Requesting OpCo'
        THEN fld.field_value
    END) AS requesting_opco,

    MAX(CASE
        WHEN fld.field_name = 'OpCo impacted'
        THEN fld.field_value
    END) AS opco_impacted,

    MAX(CASE
        WHEN fld.field_name = 'RevTrac Request'
        THEN fld.field_value
    END) AS revtrac_request,

    fv.fix_version,

    df.updated

FROM dcrtb_features df

LEFT JOIN dashboard_fields fld
    ON df.id = fld.issue_id

LEFT JOIN heiaepgdt09pwe01.silver_jira.status s
    ON df.status = s.id

LEFT JOIN fix_versions fv
    ON df.id = fv.issue_id

WHERE UPPER(df.key) = UPPER(?)

GROUP BY
    df.key,
    df.summary,
    s.name,
    fv.fix_version,
    df.updated

LIMIT 1