export const NOT_CHECKED = [
  { item: 'Injection surface', why: 'Deferred to a future version.' },
  { item: 'Health endpoints', why: 'Not a literal rule in this version.' },
  { item: 'Supabase anon key', why: 'Public by design.' },
  { item: 'Git history', why: 'Only current folder contents are examined.' },
  { item: 'Dependency CVEs', why: 'No dependency vulnerability database is consulted.' },
  { item: 'GitHub Actions risks (S25)', why: 'Workflow test-command presence is the only CI rule.' },
  { item: 'Secret validity', why: 'No generated or discovered value is sent to a provider.' },
  { item: 'RLS effectiveness', why: 'Literal migration statements do not establish effective access control.' },
  { item: 'New sb_secret_ keys', why: 'This format is not a listed provider rule.' },
] as const;
