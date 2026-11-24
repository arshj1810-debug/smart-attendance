import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Placeholder from './pages/Placeholder';
import { FacultyDashboard, Sessions, ManualAttendance, QRScreen } from './pages/Faculty';
import { Timetable, Records, Analytics, Reports } from './pages/AdminTools';
import Notifications from './pages/Notifications';
import { StudentDashboard, StudentSubjects, StudentHistory } from './pages/Student';
import StudentScan from './pages/StudentScan';
import FacultyCourses from './pages/FacultyCourses';
import { QuizManager, StudentQuizzes, QuizTake, StudentResults } from './pages/Quizzes';
import Settings from './pages/Settings';
import { Dashboard, Students, Faculty, Courses, Enrollments } from './pages/Admin';
const REAL={'/admin/dashboard':<Dashboard/>,'/admin/students':<Students/>,'/admin/faculty':<Faculty/>,'/admin/courses':<Courses/>,'/admin/enrollments':<Enrollments/>,'/faculty/dashboard':<FacultyDashboard/>,'/faculty/sessions':<Sessions/>,'/faculty/attendance':<ManualAttendance/>,'/admin/timetable':<Timetable/>,'/admin/attendance':<Records/>,'/admin/analytics':<Analytics/>,'/admin/reports':<Reports/>,'/admin/settings':<Settings/>,'/faculty/analytics':<Analytics hideFaculty/>,'/faculty/profile':<Settings/>,'/student/profile':<Settings/>,'/student/scan':<StudentScan/>,'/admin/quizzes':<QuizManager/>,'/faculty/quizzes':<QuizManager/>,'/student/quizzes':<StudentQuizzes/>,'/student/results':<StudentResults/>,'/faculty/courses':<FacultyCourses/>,'/student/dashboard':<StudentDashboard/>,'/student/attendance':<StudentSubjects/>,'/student/history':<StudentHistory/>,...Object.fromEntries(['admin','faculty','student'].map(r=>[`/${r}/notifications`,<Notifications/>]))};
import { useAuth } from './context/AuthContext';
import { HOME } from './config/nav';
const PAGES = {
  admin: ['quizzes', 'dashboard', 'students', 'faculty', 'courses', 'enrollments', 'timetable', 'attendance', 'analytics', 'reports', 'notifications', 'settings'],
  faculty: ['quizzes', 'dashboard', 'courses', 'attendance', 'sessions', 'analytics', 'notifications', 'profile'],
  student: ['quizzes', 'results', 'dashboard', 'scan', 'attendance', 'history', 'notifications', 'profile'],
};
export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute role="faculty" />}><Route path="/faculty/qr" element={<QRScreen />} /></Route>
      {Object.entries(PAGES).map(([role, pages]) => (
        <Route key={role} element={<ProtectedRoute role={role} />}>
          <Route element={<AppLayout />}>
            {pages.map((p) => <Route key={p} path={`/${role}/${p}`} element={REAL[`/${role}/${p}`]||<Placeholder />} />)}
            {role === 'student' && <Route path="/student/quizzes/:id" element={<QuizTake />} />}
          </Route>
        </Route>
      ))}
      <Route path="*" element={<Navigate to={user ? HOME[user.role] : '/login'} replace />} />
    </Routes>
  );
}
