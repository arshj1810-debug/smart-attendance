export const HOME = { admin: '/admin/dashboard', faculty: '/faculty/dashboard', student: '/student/dashboard' };
export const NAV = {
  admin: [
    { to: '/admin/dashboard', label: 'Overview' },
    { group: 'People & courses' },
    { to: '/admin/students', label: 'Students' },
    { to: '/admin/faculty', label: 'Faculty' },
    { to: '/admin/courses', label: 'Courses' },
    { to: '/admin/enrollments', label: 'Enrollments' },
    { to: '/admin/timetable', label: 'Timetable' },
    { group: 'Attendance' },
    { to: '/admin/attendance', label: 'Records' },
    { to: '/admin/analytics', label: 'Analytics' },
    { to: '/admin/reports', label: 'Reports' },
    { to: '/admin/quizzes', label: 'Quizzes' },
    { group: 'System' },
    { to: '/admin/notifications', label: 'Notifications' },
    { to: '/admin/settings', label: 'Settings' },
  ],
  faculty: [
    { to: '/faculty/dashboard', label: 'Today' },
    { to: '/faculty/courses', label: 'My courses' },
    { to: '/faculty/sessions', label: 'Sessions' },
    { to: '/faculty/attendance', label: 'Manual attendance' },
    { to: '/faculty/analytics', label: 'Analytics' },
    { to: '/faculty/quizzes', label: 'Quizzes & results' },
    { to: '/faculty/notifications', label: 'Notifications' },
    { to: '/faculty/profile', label: 'Profile & settings' },
  ],
  student: [
    { to: '/student/dashboard', label: 'My attendance' },
    { to: '/student/scan', label: 'Mark attendance' },
    { to: '/student/quizzes', label: 'Quizzes' },
    { to: '/student/results', label: 'Results' },
    { to: '/student/attendance', label: 'By subject' },
    { to: '/student/history', label: 'History' },
    { to: '/student/notifications', label: 'Notifications' },
    { to: '/student/profile', label: 'Profile & settings' },
  ],
};
// Screens not yet built, with the phase in which each arrives.
export const PAGE_META = {
  dashboard: ['Overview', 2], students: ['Students', 2], faculty: ['Faculty', 2], courses: ['Courses', 2],
  timetable: ['Timetable', 2], attendance: ['Attendance', 3], sessions: ['Sessions', 3], analytics: ['Analytics', 5],
  reports: ['Reports', 5], settings: ['Settings', 5], history: ['Attendance history', 4],
  notifications: ['Notifications', 5], profile: ['Profile & settings', 5],
};
