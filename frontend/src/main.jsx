import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SessionProvider } from './context/SessionContext';
import { NotificationProvider } from './context/NotificationContext';
import App from './App';
import { applyTheme, watchSystem } from './utils/theme';
applyTheme(); watchSystem();
import './styles/global.css';
createRoot(document.getElementById('root')).render(
  <BrowserRouter><AuthProvider><SessionProvider><NotificationProvider><App /></NotificationProvider></SessionProvider></AuthProvider></BrowserRouter>
);
