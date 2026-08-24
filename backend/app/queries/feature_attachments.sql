-- Returns all active attachment metadata for a given JIRA feature issue.
-- Joins issue_multiselect_history (field_id = 'attachment') to
-- attachment_metadata so we get both the link and the file details.

SELECT
    am.attachment_id,
    am.filename,
    am.label,
    am.media_type,
    am.mime_type,
    am.file_size,
    am.author_id,
    am.created,
    am.content_url,
    am.thumbnail_url

FROM heiaepgdt09pwe01.silver_jira.issue i

INNER JOIN heiaepgdt09pwe01.silver_jira.issue_multiselect_history imh
    ON imh.issue_id = i.id
    AND imh.field_id = 'attachment'
    AND imh.is_active = true

INNER JOIN heiaepgdt09pwe01.silver_jira.attachment_metadata am
    ON am.attachment_id = CAST(imh.value AS BIGINT)

WHERE UPPER(i.key) = UPPER(?)
  AND (i._fivetran_deleted = false OR i._fivetran_deleted IS NULL)

ORDER BY am.created DESC
