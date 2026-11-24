import React, { useState } from 'react';
import { useStore } from '../store.js';
import Icon from './Icon.jsx';

export default function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [localError, setLocalError] = useState('');
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const authenticate = useStore((s) => s.authenticate);
  const clearError = useStore((s) => s.clearError);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setLocalError('');
    clearError();
  };

  const submit = (event) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      return setLocalError('Введите корректный email');
    }
    if (form.password.length < 6) return setLocalError('Пароль должен быть не короче 6 символов');
    if (mode === 'register') {
      if (form.username.trim().length < 2) return setLocalError('Введите имя пользователя');
      if (form.password !== form.confirm) return setLocalError('Пароли не совпадают');
    }
    authenticate(mode, {
      ...(mode === 'register' ? { username: form.username } : {}),
      email: form.email,
      password: form.password,
    });
  };

  return (
    <div className="auth-screen">
      <div className="auth-art" aria-hidden="true">
        <div className="auth-art-glow" />
        <div className="auth-art-content">
          <div className="brand-mark big">M</div>
          <h1>Messass</h1>
          <p>Общайся так, как хочешь.</p>
          <div className="auth-features">
            <span><Icon name="hash" size={18} /> Каналы и серверы</span>
            <span><Icon name="dm" size={18} /> Личные сообщения</span>
            <span><Icon name="smile" size={18} /> Реакции и файлы</span>
            <span><Icon name="users" size={18} /> Роли и статусы</span>
          </div>
        </div>
      </div>

      <div className="auth-form-side">
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-tabs">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); clearError(); setLocalError(''); }}>
              Вход
            </button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); clearError(); setLocalError(''); }}>
              Регистрация
            </button>
          </div>
          <h2>{mode === 'login' ? 'С возвращением' : 'Создать аккаунт'}</h2>
          <p className="auth-subtitle">
            {mode === 'login' ? 'Войди, чтобы продолжить общение' : 'Это займёт меньше минуты'}
          </p>

          {mode === 'register' && (
            <label className="field">
              <span>Имя пользователя</span>
              <input value={form.username} onChange={update('username')} placeholder="neon_cat" autoComplete="username" />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" autoComplete="email" />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input type="password" value={form.password} onChange={update('password')} placeholder="••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          {mode === 'register' && (
            <label className="field">
              <span>Подтвердите пароль</span>
              <input type="password" value={form.confirm} onChange={update('confirm')} placeholder="••••••" autoComplete="new-password" />
            </label>
          )}

          {(localError || error) && <div className="auth-error">{localError || error}</div>}

          <button className="primary-btn auth-submit" type="submit" disabled={loading}>
            {loading ? 'Загрузка…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </button>
          <p className="auth-hint">
            {mode === 'login' ? 'Нет аккаунта? ' : 'Уже есть аккаунт? '}
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); clearError(); setLocalError(''); }}>
              {mode === 'login' ? 'Зарегистрируйся' : 'Войди'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
