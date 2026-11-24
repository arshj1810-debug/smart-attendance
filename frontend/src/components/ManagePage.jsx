import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Plus, X, Upload, Download } from 'lucide-react';
import { parseCSV, toCSV, download } from '../utils/csv';
import { http, post, put, del } from '../services/api';
const PAGE = 8;
const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true }));

// Generic table + form for an admin resource served by /api/admin/<resource>.
export default function ManagePage({ title, noun, resource, columns, fields, idKey, filterKey, filterOptions = [], allowAdd = true, allowDelete = true, allowImport = true }) {
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true), [loadErr, setLoadErr] = useState('');
  const [q, setQ] = useState(''), [flt, setFlt] = useState(''), [sort, setSort] = useState({ k: columns[0].key, dir: 1 }), [pg, setPg] = useState(0);
  const [m, setM] = useState(null), [toast, setToast] = useState(''), [formErr, setFormErr] = useState(''), [busy, setBusy] = useState(false), [th, setTh] = useState(75);
  const say = (t) => { setToast(t); setTimeout(() => setToast(''), 5000); };
  const importKeys = fields.filter((f) => !f.optional).map((f) => f.key), allKeys = fields.map((f) => f.key);
  const load = useCallback(async () => { try { setRows((await http(`/admin/${resource}`)).rows); setLoadErr(''); } catch (e) { setLoadErr(e.message); } setLoading(false); }, [resource]);
  useEffect(() => { load(); http('/settings').then((s) => setTh(s.threshold)).catch(() => {}); }, [load]);

  const importFile = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const { keys: h, rows: b } = parseCSV(await f.text()); const miss = importKeys.filter((k) => !h.includes(k));
    if (miss.length) return say(`Missing columns: ${miss.join(', ')}. Use Template for the right headers.`);
    try {
      const r = await post(`/admin/${resource}/bulk`, { rows: b });
      say(`${r.created} imported${r.skipped ? `, ${r.skipped} skipped${r.errors[0] ? ` (row ${r.errors[0].row}: ${r.errors[0].message})` : ''}` : ''}`); setPg(0); load();
    } catch (x) { say(x.message); }
  };
  const list = useMemo(() => rows.filter((r) => (!flt || r[filterKey] === flt) && JSON.stringify(Object.values(r)).toLowerCase().includes(q.toLowerCase())).sort((a, b) => cmp(a[sort.k], b[sort.k]) * sort.dir), [rows, q, flt, sort, filterKey]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE)), cur = Math.min(pg, pages - 1), view = list.slice(cur * PAGE, cur * PAGE + PAGE);
  const save = async (e) => {
    e.preventDefault(); setFormErr(''); setBusy(true);
    const d = Object.fromEntries(new FormData(e.target)); Object.keys(d).forEach((k) => { if (d[k] === '' && fields.find((f) => f.key === k)?.optional) delete d[k]; });
    try {
      if (m.mode === 'add') await post(`/admin/${resource}`, d); else await put(`/admin/${resource}/${encodeURIComponent(m.row[idKey])}`, { ...m.row, ...d });
      say(`${noun} ${m.mode === 'add' ? 'added' : 'updated'}`); setM(null); await load();
    } catch (x) { setFormErr(x.message); }
    setBusy(false);
  };
  const remove = async (r) => {
    if (!confirm(`Delete ${r.name || r[idKey]}? This cannot be undone.`)) return;
    try { const res = await del(`/admin/${resource}/${encodeURIComponent(r[idKey])}`); say(res.deactivated ? `${noun} has attendance history, so the account was deactivated instead of deleted.` : `${noun} deleted`); await load(); } catch (x) { say(x.message); }
  };
  const fname = title.toLowerCase().replace(/ /g, '-');
  const low = (r) => r.percentage !== undefined && r.total > 0 && r.percentage < th;
  return (<>
    <div className="head"><h1 className="h1">{title}</h1><div className="gap wrap">
      {allowImport && <><label className="btn"><Upload size={16} />Import CSV<input type="file" accept=".csv" hidden onChange={importFile} /></label>
        <button className="link" onClick={() => download(`${fname}-template.csv`, toCSV([], allKeys))}>Template</button></>}
      <button className="btn" onClick={() => download(`${fname}.csv`, toCSV(list, columns.map((c) => c.key)))}><Download size={16} />Export CSV</button>
      {allowAdd && <button className="btn primary" onClick={() => { setFormErr(''); setM({ mode: 'add', row: {} }); }}><Plus size={16} />Add {noun.toLowerCase()}</button>}</div></div>
    {loadErr && <div className="alert" role="alert" style={{ marginBottom: 12 }}>{loadErr}</div>}
    <div className="bar">
      <label className="search"><Search size={16} /><input placeholder={`Search ${title.toLowerCase()}`} value={q} onChange={(e) => { setQ(e.target.value); setPg(0); }} /></label>
      {filterKey && <select value={flt} onChange={(e) => { setFlt(e.target.value); setPg(0); }} aria-label="Filter"><option value="">All {filterKey}s</option>{filterOptions.map((o) => <option key={o}>{o}</option>)}</select>}
      <span className="muted tight">{loading ? 'Loading…' : `${list.length} results`}</span>
    </div>
    <div className="scroll"><table className="tbl"><thead><tr>
      {columns.map((c) => <th key={c.key}><button onClick={() => setSort({ k: c.key, dir: sort.k === c.key ? -sort.dir : 1 })}>{c.label}{sort.k === c.key ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>)}<th /></tr></thead>
      <tbody>{view.map((r) => <tr key={r[idKey]}>
        {columns.map((c) => <td key={c.key} className={c.key === 'percentage' && low(r) ? 'crit' : ''}>{c.render ? c.render(r) : r[c.key]}</td>)}
        <td className="act"><button className="link" onClick={() => setM({ mode: 'view', row: r })}>View</button><button className="link" onClick={() => { setFormErr(''); setM({ mode: 'edit', row: r }); }}>Edit</button>{allowDelete && <button className="link danger" onClick={() => remove(r)}>Delete</button>}</td></tr>)}
        {!view.length && <tr><td colSpan={columns.length + 1} className="muted">{loading ? 'Loading…' : `No ${title.toLowerCase()} match. Clear the search or filter.`}</td></tr>}</tbody></table></div>
    <div className="pager"><button className="btn" disabled={cur === 0} onClick={() => setPg(cur - 1)}>Previous</button><span>Page {cur + 1} of {pages}</span><button className="btn" disabled={cur >= pages - 1} onClick={() => setPg(cur + 1)}>Next</button></div>
    {toast && <div className="toast" role="status">{toast}</div>}
    {m && <div className="modal-bg" onClick={() => setM(null)}><div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <div className="head"><h2>{m.mode === 'add' ? `Add ${noun.toLowerCase()}` : m.mode === 'edit' ? `Edit ${noun.toLowerCase()}` : `${noun} details`}</h2><button className="icon-btn" aria-label="Close" onClick={() => setM(null)}><X size={16} /></button></div>
      {m.mode === 'view' ? <dl className="dl">{Object.entries(m.row).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>
        : <form onSubmit={save}>{fields.filter((f) => !(f.addOnly && m.mode === 'edit')).map((f) => <label className="field" key={f.key}><span>{f.label}{f.optional && m.mode === 'edit' ? ' (leave blank to keep)' : ''}</span>
          {f.options ? <select name={f.key} defaultValue={m.row[f.key] ?? (f.allowEmpty ? '' : f.options[0])}>{f.allowEmpty && <option value="">None</option>}{f.options.map((o) => <option key={o}>{o}</option>)}</select>
            : <input name={f.key} type={f.type || 'text'} required={!f.optional} minLength={f.type === 'password' ? 8 : undefined} autoComplete="off" disabled={m.mode === 'edit' && f.key === idKey} defaultValue={f.type === 'password' ? '' : m.row[f.key] ?? ''} />}</label>)}
          {m.mode === 'add' && fields.some((f) => f.type === 'password') && <p className="muted tight">If you leave the password blank the default is <b>Welcome@123</b>. Ask the user to change it after signing in.</p>}
          {formErr && <div className="alert" role="alert" style={{ margin: '8px 0' }}>{formErr}</div>}
          <div className="row"><span /><div className="gap"><button type="button" className="btn" onClick={() => setM(null)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : `Save ${noun.toLowerCase()}`}</button></div></div></form>}
    </div></div>}
  </>);
}
