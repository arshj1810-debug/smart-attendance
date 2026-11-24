import { useAuth } from '../context/AuthContext';
export default function Hello({ note }) {
  const { user } = useAuth(); const h = new Date().getHours(); const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const first = user.name.replace(/^(Dr\.|Prof\.)\s*/, '').split(' ')[0];
  const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  return <div className="hello"><h1 className="h1">Good {part}, {first}</h1><p>{date}{note ? ` · ${note}` : ''}</p></div>;
}
