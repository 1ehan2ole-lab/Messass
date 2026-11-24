import React, { useEffect } from 'react';
import { useStore } from './store.js';
import AuthScreen from './components/AuthScreen.jsx';
import ServerRail from './components/ServerRail.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChatView from './components/ChatView.jsx';
import Modals from './components/Modals.jsx';
import Toast from './components/Toast.jsx';

export default function App() {
  const booted = useStore((s) => s.booted);
  const user = useStore((s) => s.user);
  const boot = useStore((s) => s.boot);
  const openModal = useStore((s) => s.openModal);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    if (!booted || !user) return;
    const invite = new URLSearchParams(window.location.search).get('invite');
    if (invite) {
      openModal('joinServer', invite);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [booted, user, openModal]);

  if (!booted) {
    return (
      <div className="boot-screen">
        <div className="brand-mark big">M</div>
        <p>Загрузка Messass…</p>
      </div>
    );
  }

  if (!user) return <><AuthScreen /><Toast /></>;

  return (
    <div className="app-shell">
      <ServerRail />
      <Sidebar />
      <ChatView />
      <Modals />
      <Toast />
    </div>
  );
}
