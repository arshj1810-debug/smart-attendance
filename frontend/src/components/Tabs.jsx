export default function Tabs({ tabs, value, onChange }) {
  return (<div className="tabs" role="tablist">{tabs.map(([id, label, badge]) =>
    <button key={id} role="tab" aria-selected={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{label}{badge != null && <em>{badge}</em>}</button>)}</div>);
}
