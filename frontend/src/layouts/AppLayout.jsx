import { BookOpen, Database, FolderKanban, LayoutDashboard, LogOut, Network, ShieldCheck, Sparkles } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import useAuthStore from '../store/authStore'

const APP_NAV_ITEMS = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/projects', label: 'Projects', icon: FolderKanban },
  { to: '/app/datasets', label: 'Datasets', icon: Database },
  { to: '/app/experiments', label: 'Experiments', icon: BookOpen },
  { to: '/app/lab', label: 'Lab', icon: Network },
]

// --- GALAXY GRAPH GENERATION ---
const pseudoRandom = (seed) => {
  let x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

const NUM_NODES = 250
const ARMS = 3
const GALAXY_NODES = Array.from({ length: NUM_NODES }).map((_, i) => {
  const armIndex = i % ARMS
  const r = Math.pow(i / NUM_NODES, 0.6) * 550 // Radius up to 550px
  const angle = (i * 0.1) + (armIndex * ((Math.PI * 2) / ARMS))
  
  const scatter = (pseudoRandom(i) - 0.5) * (r * 0.3 + 15)
  const x = 600 + r * Math.cos(angle) + scatter
  const y = 600 + r * Math.sin(angle) + scatter
  
  const size = Math.max(1, 4 - (r / 200)) + pseudoRandom(i + 1000)
  const opacity = Math.max(0.15, 1 - (r / 600))
  return { id: i, x, y, size, r, opacity }
})

const GALAXY_EDGES = []
// Connect along arms
for (let i = 0; i < NUM_NODES - ARMS; i++) {
  if (pseudoRandom(i + 2000) > 0.1) {
    GALAXY_EDGES.push({ p1: GALAXY_NODES[i], p2: GALAXY_NODES[i + ARMS], delay: pseudoRandom(i) * 5 })
  }
}
// Add some cross-arm connections in the bright center
for (let i = 0; i < 50; i++) {
  if (pseudoRandom(i + 3000) > 0.5) {
    GALAXY_EDGES.push({ p1: GALAXY_NODES[i], p2: GALAXY_NODES[Math.floor(pseudoRandom(i + 4000) * 50)], delay: pseudoRandom(i) * 5 })
  }
}
// -------------------------------

const TITLES = {
  '/app/dashboard': {
    eyebrow: 'Workspace',
    title: 'Research Dashboard',
    description: 'Project context, dataset context, and the next step before training.',
  },
  '/app/projects': {
    eyebrow: 'Projects',
    title: 'Project Governance',
    description: 'Create and select the project container that owns your runs.',
  },
  '/app/datasets': {
    eyebrow: 'Datasets',
    title: 'Dataset Library',
    description: 'Manage dataset records, versions, publish state, and trainable context.',
  },
}

function AppNavLink({ item }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `app-nav-link ${isActive ? 'app-nav-link-active' : ''}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={16} className={isActive ? 'text-white' : 'text-twilight'} />
          <span className="font-semibold">{item.label}</span>
          {isActive && (
            <motion.div
              layoutId="nav-indicator-active"
              className="absolute right-3 h-1.5 w-1.5 rounded-full bg-accent-amethyst shadow-[0_0_8px_var(--accent-amethyst)]"
            />
          )}
        </>
      )}
    </NavLink>
  )
}

function UserBadge({ user }) {
  return (
    <div className="app-user-badge group hover:border-accent-amethyst/30 transition-all duration-300">
      <div className="app-user-avatar group-hover:scale-110 transition-transform duration-300">
        <span className="text-sm font-bold text-white">
          {(user?.username || 'U')[0].toUpperCase()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-white-star truncate group-hover:text-white transition-colors">
          {user?.username || 'Unknown'}
        </div>
        <div className="text-[10px] text-text-shadow truncate">
          {user?.email || 'No email'}
        </div>
      </div>
      <span className="app-role-tag group-hover:bg-accent-amethyst/20 transition-colors">
        {user?.role || 'viewer'}
      </span>
    </div>
  )
}

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  if (location.pathname === '/app/lab') {
    return <Outlet />
  }

  const titleMeta = TITLES[location.pathname]

  return (
    <div className="min-h-screen bg-abyss text-starlight selection:bg-accent-amethyst/30">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        {/* ── Sidebar ── */}
        <aside className="app-sidebar border-r border-line-subtle shadow-2xl">
          {/* Constellation particles in sidebar */}
          <div className="sidebar-cosmos">
            {Array.from({ length: 18 }).map((_, i) => (
              <div
                key={i}
                className="sidebar-particle"
                style={{
                  '--px': `${5 + Math.random() * 90}%`,
                  '--py': `${Math.random() * 100}%`,
                  '--ps': `${Math.random() * 3 + 1}px`,
                  '--pdur': `${Math.random() * 10 + 6}s`,
                  '--pdel': `${Math.random() * -10}s`,
                }}
              />
            ))}
            {/* Smooth GNN sub-graph in sidebar */}
            <svg className="absolute inset-0 w-full h-full opacity-30" preserveAspectRatio="none">
              <line x1="20%" y1="20%" x2="80%" y2="40%" stroke="rgba(147,51,234,0.4)" strokeWidth="1" />
              <line x1="80%" y1="40%" x2="40%" y2="70%" stroke="rgba(129,140,248,0.3)" strokeWidth="1" />
              <line x1="40%" y1="70%" x2="90%" y2="85%" stroke="rgba(244,114,182,0.3)" strokeWidth="1" />
              <line x1="20%" y1="20%" x2="40%" y2="70%" stroke="rgba(147,51,234,0.2)" strokeWidth="1" />
              <line x1="80%" y1="40%" x2="90%" y2="85%" stroke="rgba(129,140,248,0.2)" strokeWidth="1" />
            </svg>
            {[
              { x: 20, y: 20, s: 4 }, { x: 80, y: 40, s: 6 },
              { x: 40, y: 70, s: 5 }, { x: 90, y: 85, s: 4 },
            ].map((n, i) => (
              <div
                key={i}
                className="absolute rounded-full bg-amethyst/40 shadow-[0_0_10px_rgba(147,51,234,0.4)]"
                style={{
                  left: `calc(${n.x}% - ${n.s/2}px)`,
                  top: `calc(${n.y}% - ${n.s/2}px)`,
                  width: `${n.s}px`,
                  height: `${n.s}px`,
                }}
              />
            ))}
          </div>

          <div className="relative z-10 flex flex-col h-full px-5 py-7">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-8">
              <div className="app-logo-icon">
                <Network size={18} className="text-white" />
              </div>
              <div>
                <div className="text-[12px] font-black uppercase tracking-[0.25em] text-white-star">GNN-Insight</div>
                <div className="text-[10px] text-moonlight font-medium">Research workspace</div>
              </div>
            </div>

            {/* Nav */}
            <nav className="space-y-4">
              {APP_NAV_ITEMS.map((item, idx) => (
                <motion.div
                  key={item.to}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ scale: 1.05, x: 5 }}
                  transition={{ delay: idx * 0.05 + 0.1 }}
                >
                  <AppNavLink item={item} />
                </motion.div>
              ))}
            </nav>

            {/* Spacer */}
            <div className="flex-1" />

            {/* User + Actions */}
            <div className="mt-4 space-y-3 pb-2">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <UserBadge user={user} />
              </motion.div>

              <div className="flex flex-col gap-2">
                {user?.role === 'admin' && (
                  <button
                    onClick={() => navigate('/admin/overview')}
                    className="app-action-btn app-action-btn-admin hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    <ShieldCheck size={14} /> Admin
                  </button>
                )}
                <button
                  onClick={() => {
                    logout()
                    navigate('/login', { replace: true })
                  }}
                  className="app-action-btn app-action-btn-logout hover:text-aurora-rose hover:bg-aurora-rose/10 hover:border-aurora-rose/20 active:scale-95 transition-all"
                >
                  <LogOut size={14} /> Log out
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main Area ── */}
        <div className="flex min-h-screen flex-col relative overflow-hidden bg-[#030108]">
          {/* Nebula Backdrop */}
          <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center opacity-60 mix-blend-screen overflow-hidden">
            <div className="absolute w-[800px] h-[800px] bg-amethyst/10 rounded-full blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
            <div className="absolute w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[80px]" />
            <div className="absolute w-[150px] h-[150px] bg-fuchsia-500/20 rounded-full blur-[50px] animate-[pulse_4s_ease-in-out_infinite]" />
          </div>

          {/* Galaxy Graph Container */}
          <div className="app-content-cosmos pointer-events-none absolute inset-0 z-0 opacity-90 overflow-hidden">
            <style>
              {`
                @keyframes galaxy-spin {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
                @keyframes data-flow {
                  from { stroke-dashoffset: 400; }
                  to { stroke-dashoffset: 0; }
                }
                .gnn-galaxy-wrapper {
                  position: absolute;
                  top: 50%;
                  left: 50%;
                  width: 1200px;
                  height: 1200px;
                  margin-top: -600px;
                  margin-left: -600px;
                  animation: galaxy-spin 180s linear infinite;
                }
                .gnn-edge-base {
                  stroke: rgba(139, 92, 246, 0.15);
                  stroke-width: 0.5px;
                }
                .data-packet {
                  stroke: rgba(167, 139, 250, 0.8);
                  stroke-width: 1.5px;
                  stroke-dasharray: 8 400;
                  animation: data-flow 4s linear infinite;
                  stroke-linecap: round;
                  filter: drop-shadow(0 0 4px rgba(167, 139, 250, 0.8));
                }
              `}
            </style>
            
            <div className="gnn-galaxy-wrapper">
              {/* Connected Graph Edges & Data Packets */}
              <svg className="w-full h-full absolute inset-0" viewBox="0 0 1200 1200">
                <g>
                  {GALAXY_EDGES.map((edge, i) => (
                    <g key={i}>
                      <line x1={edge.p1.x} y1={edge.p1.y} x2={edge.p2.x} y2={edge.p2.y} className="gnn-edge-base" />
                      <line 
                        x1={edge.p1.x} y1={edge.p1.y} x2={edge.p2.x} y2={edge.p2.y} 
                        className="data-packet" 
                        style={{ 
                          animationDelay: `-${edge.delay}s`,
                        }} 
                      />
                    </g>
                  ))}
                </g>
              </svg>

              {/* Galaxy Nodes */}
              {GALAXY_NODES.map((n) => (
                <div
                  key={n.id}
                  className="absolute rounded-full"
                  style={{
                    left: `${(n.x / 1200) * 100}%`,
                    top: `${(n.y / 1200) * 100}%`,
                    width: `${n.size}px`,
                    height: `${n.size}px`,
                    transform: `translate(-50%, -50%)`,
                    backgroundColor: '#ddd6fe',
                    opacity: n.opacity,
                    boxShadow: n.size > 2 ? `0 0 ${n.size * 3}px rgba(167, 139, 250, 0.8)` : 'none'
                  }}
                />
              ))}
            </div>
          </div>

          {/* Header */}
          {titleMeta && (
            <header className="app-header">
              <div className="flex items-center gap-2">
                <Sparkles size={12} className="text-moonlight" />
                <span className="text-micro font-semibold uppercase tracking-ultra text-moonlight">{titleMeta.eyebrow}</span>
              </div>
              <h1 className="mt-1.5 text-2xl font-black text-white-star tracking-tight">{titleMeta.title}</h1>
              <p className="mt-1 max-w-2xl text-[13px] leading-5 text-twilight">{titleMeta.description}</p>
            </header>
          )}

          {/* Content */}
          <main className="relative z-10 flex-1 p-6 overflow-auto custom-scrollbar">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="min-h-[calc(100vh-10rem)]"
            >
              <Outlet />
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  )
}
