import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CreditCard,
  FileText,
  Settings
} from 'lucide-react'
import { cn } from '@/lib/utils'

const mainItems = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/grupos', label: 'Grupos', icon: BookOpen },
  { to: '/pagos', label: 'Pagos', icon: CreditCard },
  { to: '/reportes', label: 'Reportes', icon: FileText }
]

function itemClass({ isActive }) {
  return cn(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-sidebar-accent text-sidebar-primary'
      : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
  )
}

function Sidebar() {
  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="px-4 py-5">
        <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
          Gestión Contable
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {mainItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={itemClass}>
            <Icon className="size-4 shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <NavLink to="/configuracion" className={itemClass}>
          <Settings className="size-4 shrink-0" />
          <span>Configuración</span>
        </NavLink>
      </div>
    </aside>
  )
}

export default Sidebar
