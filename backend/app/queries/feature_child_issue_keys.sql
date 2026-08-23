SELECT
    child.key
FROM heiaepgdt09pwe01.silver_jira.issue parent
INNER JOIN heiaepgdt09pwe01.silver_jira.issue child
    ON child.parent_id = parent.id
WHERE UPPER(parent.key) = UPPER(?)
  AND (parent._fivetran_deleted = false OR parent._fivetran_deleted IS NULL)
  AND (child._fivetran_deleted = false OR child._fivetran_deleted IS NULL)
  AND (
        UPPER(child.key) LIKE 'CTB%'
        OR UPPER(child.key) LIKE 'CMD%'
      )
ORDER BY child.key;
