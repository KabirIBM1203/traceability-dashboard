-- Returns all qTest remote links attached to a given JIRA feature issue.
-- Filters on application_type / application_name / URL containing "qtest" or "tricentis".

SELECT
    irl.id               AS link_id,
    irl.relationship     AS relationship,
    irl.object_title     AS title,
    irl.object_url       AS url,
    irl.object_summary   AS summary,
    irl.application_type AS application_type,
    irl.application_name AS application_name

FROM heiaepgdt09pwe01.silver_jira.issue i

INNER JOIN heiaepgdt09pwe01.silver_jira.issue_remote_link irl
    ON irl.issue_id = i.id

WHERE UPPER(i.key) = UPPER(?)
  AND (i._fivetran_deleted = false OR i._fivetran_deleted IS NULL)
  AND (
        LOWER(irl.application_type) LIKE '%qtest%'
     OR LOWER(irl.application_name) LIKE '%qtest%'
     OR LOWER(irl.object_url)       LIKE '%qtest%'
     OR LOWER(irl.object_url)       LIKE '%tricentis%'
  )

ORDER BY irl.id
