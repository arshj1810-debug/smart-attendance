import { useEffect, useState } from 'react';
import { http } from './api';
// Dropdown data (departments, courses, faculty, semesters) shared by forms and filters.
export function useMeta() {
  const [meta, setMeta] = useState(null), [error, setError] = useState('');
  useEffect(() => { http('/meta').then(setMeta).catch((e) => setError(e.message)); }, []);
  return { meta, error };
}
