import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from './config.js';
import { pool, one, tx } from './db.js';
import { lowAttendanceAlerts } from './lib/alerts.js';

const NAMES = ['Aarav Sharma', 'Arpit Jain', 'Riya Verma', 'Rahul Gupta', 'Neha Singh', 'Karan Patel', 'Ishita Mishra', 'Vivek Yadav', 'Pooja Tiwari', 'Aditya Chauhan', 'Sneha Joshi', 'Mohit Agrawal', 'Ananya Dubey', 'Harsh Saxena', 'Kavya Nair', 'Dev Malhotra', 'Simran Kaur', 'Yash Rathore'];
const DEPTS = ['Computer Science', 'Mathematics', 'Electronics', 'Mechanical Engineering'];
const PROGRAMS = ['B.Tech Computer Science', 'B.Sc Mathematics', 'B.Tech Electronics', 'B.Tech Mechanical'];
const SEMS = [3, 5, 5, 7];
const P = [88, 92, 68, 81, 73, 95, 59, 84, 77, 64, 90, 71, 86, 62, 79, 93, 70, 85]; // each student's attendance tendency (%)
const FACULTY = [
  ['FAC014', 'Prof. Sandeep Rao', 'faculty@college.edu', 'Computer Science'], ['FAC010', 'Dr. Anita Deshmukh', 'anita.deshmukh@college.edu', 'Mathematics'],
  ['FAC011', 'Prof. Manoj Trivedi', 'manoj.trivedi@college.edu', 'Electronics'], ['FAC012', 'Dr. Rekha Pandey', 'rekha.pandey@college.edu', 'Mechanical Engineering'],
  ['FAC013', 'Prof. Alok Bansal', 'alok.bansal@college.edu', 'Computer Science'], ['FAC015', 'Dr. Farah Khan', 'farah.khan@college.edu', 'Mathematics'],
];
// code, name, department, semester, faculty code, [[day, time, room], ...]
const COURSES = [
  ['CS201', 'Data Structures', 0, 'FAC014', [['Monday', '09:00–09:50', 'Room 204'], ['Thursday', '11:00–11:50', 'Room 204']]],
  ['CS202', 'Database Systems', 0, 'FAC013', [['Tuesday', '10:00–10:50', 'Lab 1'], ['Friday', '11:00–11:50', 'Lab 1']]],
  ['MA201', 'Mathematics', 1, 'FAC014', [['Monday', '11:00–11:50', 'Room 110'], ['Wednesday', '10:00–10:50', 'Room 110']]],
  ['MA202', 'Probability & Statistics', 1, 'FAC010', [['Tuesday', '09:00–09:50', 'Room 112'], ['Thursday', '14:00–14:50', 'Room 112']]],
  ['MA203', 'Physics', 1, 'FAC015', [['Wednesday', '14:00–14:50', 'Lab 2'], ['Friday', '09:00–09:50', 'Lab 2']]],
  ['EC201', 'Digital Electronics', 2, 'FAC014', [['Tuesday', '14:00–14:50', 'Lab 3'], ['Friday', '14:00–14:50', 'Lab 3']]],
  ['EC202', 'Signals & Systems', 2, 'FAC011', [['Monday', '14:00–14:50', 'Room 301'], ['Thursday', '09:00–09:50', 'Room 301']]],
  ['ME201', 'Thermodynamics', 3, 'FAC012', [['Wednesday', '09:00–09:50', 'Room 410'], ['Saturday', '10:00–10:50', 'Room 410']]],
  ['ME202', 'Machine Design', 3, 'FAC012', [['Tuesday', '11:00–11:50', 'Room 411'], ['Friday', '10:00–10:50', 'Room 411']]],
];
const DAY_NUM = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function resetDatabase() {
  await pool.query(`TRUNCATE quiz_attempts, quizzes, notification_reads, notifications, qr_used_tokens, attendance_records, attendance_sessions, timetable_slots, enrollments, courses, users, audit_logs RESTART IDENTITY CASCADE`);
}

export async function seedIfEmpty() {
  const { n } = await one('SELECT COUNT(*)::int AS n FROM users');
  if (n > 0) return false;
  if (!config.seedDemo) {
    const email = (process.env.ADMIN_EMAIL || 'admin@college.edu').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    await pool.query(`INSERT INTO users (code, name, email, password_hash, role, department) VALUES ('ADM001','Administrator',$1,$2,'admin','Administration')`, [email, bcrypt.hashSync(password, 10)]);
    console.log(`[seed] Created first admin account: ${email} / ${process.env.ADMIN_PASSWORD ? '(password from ADMIN_PASSWORD)' : password}`);
    return true;
  }
  await seedDemo();
  return true;
}

export async function seedDemo() {
  const hash = bcrypt.hashSync('demo123', 8);
  const ids = {}; // code -> user_id
  const courseIds = {};
  const sessions = [];

  await tx(async (c) => {
    const addUser = async (code, name, email, role, dept, program = '', sem = null, status = 'Active') => {
      ids[code] = (await c.query(`INSERT INTO users (code, name, email, password_hash, role, department, program, semester, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING user_id`, [code, name, email, hash, role, dept, program, sem, status])).rows[0].user_id;
    };
    await addUser('ADM001', 'Dr. Meenal Kulkarni', 'admin@college.edu', 'admin', 'Administration');
    for (const [code, name, email, dept] of FACULTY) await addUser(code, name, email, 'faculty', dept);
    const students = NAMES.map((name, i) => ({ i, name, code: `0801${['CS', 'MA', 'EC', 'ME'][i % 4]}23${String(i + 1).padStart(3, '0')}`, d: i % 4 }));
    for (const s of students) await addUser(s.code, s.name, s.i === 1 ? 'student@college.edu' : `${s.name.split(' ')[0].toLowerCase()}${s.i + 1}@college.edu`, 'student', DEPTS[s.d], PROGRAMS[s.d], SEMS[s.d], s.i === 6 ? 'Inactive' : 'Active');

    for (const [code, name, d, fac, slots] of COURSES) {
      const row = (await c.query(`INSERT INTO courses (course_code, course_name, department, semester, assigned_faculty_id) VALUES ($1,$2,$3,$4,$5) RETURNING course_id`, [code, name, DEPTS[d], SEMS[d], ids[fac]])).rows[0];
      courseIds[code] = row.course_id;
      for (const [day, time, room] of slots) await c.query('INSERT INTO timetable_slots (course_id, day, time_slot, room) VALUES ($1,$2,$3,$4)', [row.course_id, day, time, room]);
    }
    await c.query(`INSERT INTO enrollments (student_id, course_id) SELECT u.user_id, c.course_id FROM users u JOIN courses c ON c.department = u.department AND c.semester = u.semester WHERE u.role = 'student' AND u.status = 'Active'`);

    // Five weeks of finished classes following each course's timetable, with believable attendance.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const [code, , d, fac, slots] of COURSES) {
      const enrolled = students.filter((s) => s.d === d && s.i !== 6);
      for (const [day, time, room] of slots) {
        for (let back = 1; back <= 35; back++) {
          const date = new Date(today); date.setDate(today.getDate() - back);
          if (date.getDay() !== DAY_NUM[day]) continue;
          const [h, m] = time.split('–')[0].split(':').map(Number);
          const start = new Date(date); start.setHours(h, m, 0, 0); const end = new Date(start.getTime() + 50 * 60000);
          const s = (await c.query(`INSERT INTO attendance_sessions (course_id, faculty_id, session_date, time_label, room, kind, started_at, ended_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING session_id`,
            [courseIds[code], ids[fac], iso(date), time, room, room.startsWith('Lab') ? 'Lab' : 'Lecture', start.toISOString(), end.toISOString()])).rows[0].session_id;
          const rand = rng(s * 7919 + 13);
          const sid = [], st = [];
          for (const stu of enrolled) {
            // The demo student is deliberately short in Mathematics so the 75% warning is visible.
            const p = stu.i === 1 ? (code === 'MA201' ? 0.62 : 0.9) : P[stu.i] / 100;
            const v = rand();
            sid.push(ids[stu.code]); st.push(v < p ? (rand() < 0.08 ? 'Late' : 'Present') : 'Absent');
          }
          await c.query(`INSERT INTO attendance_records (session_id, student_id, status, method, marked_at) SELECT $1::int, unnest($2::int[]), unnest($3::text[]), 'seed', $4::timestamptz`, [s, sid, st, end.toISOString()]);
          sessions.push(s);
        }
      }
    }

    const q = (title, code, questions, days) => c.query(`INSERT INTO quizzes (title, course_id, created_by, duration_min, deadline, questions) VALUES ($1,$2,$3,15,now() + ($4::text || ' days')::interval,$5::jsonb)`, [title, courseIds[code], ids.FAC014, String(days), JSON.stringify(questions)]);
    await q('Data Structures: Quick Check 1', 'CS201', [
      { text: 'Which structure follows Last-In-First-Out order?', options: ['Queue', 'Stack', 'Array', 'Graph'], correct: 1 },
      { text: 'Average time to search a balanced binary search tree?', options: ['O(1)', 'O(n)', 'O(log n)', 'O(n log n)'], correct: 2 },
      { text: 'Which traversal of a BST yields sorted output?', options: ['Pre-order', 'In-order', 'Post-order', 'Level-order'], correct: 1 }], 7);
    await q('Mathematics: Matrices Quiz', 'MA201', [
      { text: 'The determinant of the 2×2 identity matrix is?', options: ['0', '1', '2', '-1'], correct: 1 },
      { text: 'A matrix with equal rows and columns is called?', options: ['Diagonal', 'Square', 'Sparse', 'Scalar'], correct: 1 },
      { text: 'If det(A) = 0, the matrix is?', options: ['Invertible', 'Singular', 'Orthogonal', 'Identity'], correct: 1 }], 7);

    await c.query(`INSERT INTO notifications (title, body, audience, type, created_by) VALUES
      ('End-semester schedule', 'The exam timetable will be published on the portal next week.', 'all', 'Announcement', $1),
      ('Attendance reminder', 'Faculty: please end every session so records are saved and low-attendance warnings can go out.', 'faculty', 'Announcement', $1)`, [ids.ADM001]);
    await c.query(`INSERT INTO audit_logs (type, actor, detail) VALUES ('course_create','admin','CS201 Data Structures'),('student_create','admin','0801MA23002 Arpit Jain'),('session_end','FAC014','MA201 completed')`);
  });

  for (const id of Object.values(courseIds)) await lowAttendanceAlerts(id);
  console.log(`[seed] Demo data loaded: ${NAMES.length} students, ${FACULTY.length} faculty, ${COURSES.length} courses, ${sessions.length} past sessions.`);
}
