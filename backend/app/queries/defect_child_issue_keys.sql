-- Direct children of a defect issue (sub-tasks, linked issues at child level).
-- No project-prefix filter — returns all direct children regardless of key prefix,
-- since DBBT/DMD0 defects can have sub-tasks with arbitrary key prefixes.
-- Parameterised by parent issue key (?).

SELECT
    child.key
FROM heiaepgdt09pwe01.silver_jira.issue parent
INNER JOIN heiaepgdt09pwe01.silver_jira.issue child
    ON child.parent_id = parent.id
WHERE UPPER(parent.key) = UPPER(?)
  AND (parent._fivetran_deleted = false OR parent._fivetran_deleted IS NULL)
  AND (child._fivetran_deleted  = false OR child._fivetran_deleted  IS NULL)
ORDER BY child.key;
