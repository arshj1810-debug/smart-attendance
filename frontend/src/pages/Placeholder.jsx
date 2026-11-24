import { useLocation } from 'react-router-dom';
import { PAGE_META } from '../config/nav';
export default function Placeholder() {
  const key = useLocation().pathname.split('/').pop();
  const [title, phase] = PAGE_META[key] || [key, '-'];
  return (<><h1 className="h1">{title}</h1><p className="muted">This screen arrives in Phase {phase}. Navigation, role access and layout are live.</p></>);
}
