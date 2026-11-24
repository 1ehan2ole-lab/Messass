import React from 'react';
import { useStore } from '../store.js';
import Icon from './Icon.jsx';

export default function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className={`toast ${toast.kind}`} key={toast.id}>
      <Icon name={toast.kind === 'error' ? 'bell' : 'check'} size={18} />
      <span>{toast.message}</span>
    </div>
  );
}
