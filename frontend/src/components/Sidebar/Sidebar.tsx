import type { ReactNode } from 'react';
import './Sidebar.css';

interface SidebarProps {
  children: ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <h1 className="sidebar__title">Инфраструктурная доступность</h1>
        <p className="sidebar__subtitle">Анализ социальной инфраструктуры</p>
      </div>
      <div className="sidebar__content">{children}</div>
    </aside>
  );
}
