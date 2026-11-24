// End-to-end smoke test against a RUNNING server with the demo data loaded.
//   npm run smoke            (API_URL defaults to http://localhost:3200)
const BASE = process.env.API_URL || 'http://localhost:3200';
let pass = 0, failed = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : failed++; console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${cond ? '' : `  ${extra}`}`); };
const call = async (method, path, token, body) => {
  const res = await fetch(BASE + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const login = async (email) => (await call('POST', '/auth/login', null, { email, password: 'demo123' })).data.accessToken;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const h = await call('GET', '/health');
ok('health: backend and database are up', h.status === 200 && h.data.ok, JSON.stringify(h.data));
if (h.status !== 200) { console.log('\nServer not reachable. Start it first (npm run dev).'); process.exit(1); }

const bad = await call('POST', '/auth/login', null, { email: 'admin@college.edu', password: 'wrong-password' });
ok('login: wrong password is rejected (401)', bad.status === 401);
const admin = await login('admin@college.edu'), fac = await login('faculty@college.edu');
const arpit = await login('student@college.edu'), karan = await login('karan6@college.edu'), aditya = await login('aditya10@college.edu');
ok('login: admin, faculty and students receive JWTs', [admin, fac, arpit, karan, aditya].every(Boolean));
ok('security: no token gives 401', (await call('GET', '/courses')).status === 401);
ok('security: student cannot open admin data (403)', (await call('GET', '/admin/students', arpit)).status === 403);
ok('security: student cannot view another student analytics (403)', (await call('GET', '/analytics/student/0801CS23001', arpit)).status === 403);

const mine = await call('GET', '/analytics/my', arpit);
const ma = mine.data.subjects?.find((s) => s.code === 'MA201');
ok('analytics: student sees per-course percentages', mine.status === 200 && !!ma && ma.total > 0, JSON.stringify(mine.data).slice(0, 120));
ok('analytics: percentage = (Present+Late) / recorded sessions', !!ma && Math.abs(ma.percentage - Math.round((ma.attended / ma.total) * 1000) / 10) < 0.01);
ok('analytics: Mathematics is flagged below the threshold for the demo student', !!ma && ma.low_attendance === true, `pct=${ma?.percentage}`);
ok('report: faculty gets the MA201 course report', (await call('GET', '/attendance/course/MA201/report', fac)).data.students?.length > 0);
ok('report: student is denied the faculty report (403)', (await call('GET', '/attendance/course/MA201/report', arpit)).status === 403);
ok('dashboard: admin overview loads', (await call('GET', '/admin/overview', admin)).data.counts?.students > 0);

// Make sure the faculty has no live session left over from manual testing.
const live = (await call('GET', '/sessions/active', fac)).data.session; if (live) await call('POST', `/sessions/${live.id}/end`, fac);
const s = await call('POST', '/sessions/create', fac, { code: 'MA201', name: 'Mathematics', room: 'Room 110', time: 'smoke test' });
ok('session: faculty starts an attendance session', s.status === 201 && s.data.id, JSON.stringify(s.data).slice(0, 120));
const sid = s.data.id;
ok('session: all enrolled students start as Absent', Object.values(s.data.marks || {}).every((v) => v === 'Absent') && Object.keys(s.data.marks || {}).length > 0);
ok('session: second live session is refused (409)', (await call('POST', '/sessions/create', fac, { code: 'EC201', name: 'x' })).status === 409);
ok('session: student can see the live session', (await call('GET', '/sessions/active', arpit)).data.session?.id === sid);

const t1 = (await call('GET', `/sessions/${sid}/qr`, fac)).data.token;
ok('qr: faculty receives a signed token', !!t1 && t1.split('.').length === 4);
const scan1 = await call('POST', '/attendance/scan', arpit, { token: 'ATT1:' + t1 });
ok('qr: valid scan marks the student present', scan1.status === 200 && scan1.data.ok && ['Present', 'Late'].includes(scan1.data.status), JSON.stringify(scan1.data));
const replay = await call('POST', '/attendance/scan', karan, { token: 'ATT1:' + t1 });
ok('qr: replayed code is rejected', replay.status === 400 && /already used/i.test(replay.data.message || ''), JSON.stringify(replay.data));
const tamper = await call('POST', '/attendance/scan', karan, { token: 'ATT1:' + t1.slice(0, -3) + 'abc' });
ok('qr: tampered code is rejected', tamper.status === 400);
const t2 = (await call('GET', `/sessions/${sid}/qr`, fac)).data.token; await wait(4000);
const expired = await call('POST', '/attendance/scan', aditya, { token: 'ATT1:' + t2 });
ok('qr: expired code (older than 2s + grace) is rejected', expired.status === 400 && /expired/i.test(expired.data.message || ''), JSON.stringify(expired.data));
const t3 = (await call('GET', `/sessions/${sid}/qr`, fac)).data.token;
ok('qr: a fresh code works for another student', (await call('POST', '/attendance/scan', karan, { token: 'ATT1:' + t3 })).data.ok === true);

const man = await call('POST', '/attendance/mark', fac, { sessionId: sid, records: [{ studentId: '0801MA23010', status: 'Late' }] });
ok('manual: faculty marks a student Late', man.status === 200 && man.data.marks?.['0801MA23010'] === 'Late', JSON.stringify(man.data).slice(0, 150));
ok('manual: invalid status is rejected (400)', (await call('POST', '/attendance/mark', fac, { sessionId: sid, records: [{ studentId: '0801MA23010', status: 'Maybe' }] })).status === 400);
ok('manual: student cannot mark attendance (403)', (await call('POST', '/attendance/mark', arpit, { sessionId: sid, records: [] })).status === 403);

const end = await call('POST', `/sessions/${sid}/end`, fac);
ok('session: faculty ends the session', end.status === 200 && end.data.endedAt);
const hist = await call('GET', '/attendance/me', arpit);
ok('history: student sees the new record', hist.data.records?.some((r) => r.code === 'MA201'));
const nots = await call('GET', '/notifications', arpit);
ok('notifications: student has a low-attendance or attendance notification', nots.status === 200 && nots.data.notifications.length > 0);

console.log(`\n${pass} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
