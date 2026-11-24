import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Wifi, ShieldCheck, ShieldAlert } from 'lucide-react';
import jsQR from 'jsqr';
import { useAuth } from '../context/AuthContext';
import { useSession } from '../context/SessionContext';
import { http } from '../services/api';
const Row = ({ icon: I, label, state, text }) => <div className={`vrow ${state}`}><i className="chip sm"><I size={16} /></i><div className="grow"><b>{label}</b><p>{text}</p></div><span className="pill">{state === 'ok' ? 'Verified' : state === 'bad' ? 'Blocked' : 'Checking'}</span></div>;
export default function StudentScan() {
  const { user } = useAuth(); const { session, submitScan } = useSession(); 
  const [code, setCode] = useState(''), [res, setRes] = useState(null), [cam, setCam] = useState(false), [busy, setBusy] = useState(false), video = useRef(null);
  const [geo, setGeo] = useState(null), [geoErr, setGeoErr] = useState(''), [env, setEnv] = useState(null), geoRef = useRef(null); geoRef.current = geo;
  const canCam = !!navigator.mediaDevices?.getUserMedia;
  useEffect(() => {
    if (!navigator.geolocation) { setGeoErr('This browser does not support location. Use a current browser over HTTPS or localhost.'); return; }
    const id = navigator.geolocation.watchPosition((p) => { setGeo({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); setGeoErr(''); },
      (e) => setGeoErr(e.code === 1 ? 'Location permission is blocked. Allow it in your browser settings.' : 'Could not get your location. Move to an open area.'), { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  useEffect(() => {
    let off = false; const run = async () => { try { const r = await http('/attendance/verify/' + (geo ? `?lat=${geo.lat}&lng=${geo.lng}&accuracy=${geo.accuracy}` : '')); if (!off) setEnv(r); } catch { if (!off) setEnv(null); } };
    run(); const t = setInterval(run, 8000); return () => { off = true; clearInterval(t); };
  }, [geo?.lat, geo?.lng]);
  const net = !env ? ['wait', 'Checking your network…'] : [env.network.ok ? 'ok' : 'bad', env.network.message];
  const gps = env && !env.gps.enabled ? ['ok', env.gps.message] : geoErr ? ['bad', geoErr] : !geo || !env ? ['wait', 'Getting your location…'] : [env.gps.ok ? 'ok' : 'bad', env.gps.message];
  const ready = net[0] === 'ok' && gps[0] === 'ok';
  const submit = async (raw) => {
    setBusy(true); const r = await submitScan(user.id, raw, geoRef.current || {}); setBusy(false); setRes(r);
    if (r.ok) setCode('');
  };
  useEffect(() => {
    if (!cam) return; let stop = false, stream, raf; const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); const v = video.current; v.srcObject = stream; await v.play();
        const tick = () => {
          if (stop) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA) { canvas.width = v.videoWidth; canvas.height = v.videoHeight; ctx.drawImage(v, 0, 0); const d = ctx.getImageData(0, 0, canvas.width, canvas.height), r = jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' }); if (r?.data) { stop = true; setCam(false); submit(r.data); return; } }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { setRes({ ok: false, message: 'Camera access was blocked or is unavailable. Allow camera access to scan.' }); setCam(false); }
    })();
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [cam]);
  return (<>
    <h1 className="h1">Mark attendance</h1>
    {session ? <p className="muted"><b style={{ color: 'var(--ok)' }}>Session active</b> · {session.name} {session.code} · {session.room} · {session.time}</p>
      : <p className="muted">No session is active. Your faculty starts one in class and shows a QR code on the projector.</p>}
    <section className="panel verify" style={{ maxWidth: 520 }}><h2>{ready ? <><ShieldCheck size={16} /> Ready to scan</> : <><ShieldAlert size={16} /> Verification needed</>}</h2>
      <Row icon={MapPin} label="Location (GPS)" state={gps[0]} text={gps[1]} /><Row icon={Wifi} label="Campus network" state={net[0]} text={net[1]} /></section>
    {res && <div className={`alert ${res.ok ? 'ok' : ''}`} role={res.ok ? 'status' : 'alert'} style={{ maxWidth: 520, marginTop: 14 }}>{res.message} {res.ok && <><Link to="/student/history" className="link">View history</Link> · <Link to="/student/dashboard" className="link">My attendance</Link></>}</div>}
    <div className="stack" style={{ maxWidth: 520, marginTop: 16 }}>
      {canCam ? <button className="btn primary" disabled={busy || !ready} onClick={() => { setRes(null); setCam(!cam); }}>{cam ? 'Stop camera' : 'Scan QR with camera'}</button> : <p className="muted tight">Camera scanning needs HTTPS or localhost.</p>}
      {cam && <video ref={video} className="scanvideo" muted playsInline />}
      <form className="stack" onSubmit={(e) => { e.preventDefault(); submit(code); }}>
        <label className="field"><span>Or enter the code shown on screen</span><input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck="false" /></label>
        <button className="btn" disabled={busy || !ready || !code.trim()}>Submit code</button></form>
      <p className="muted tight">The code changes every 2 seconds and works once. The server re-checks your location and network on every scan.</p></div>
  </>);
}
