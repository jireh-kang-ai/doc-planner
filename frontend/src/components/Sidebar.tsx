import { Tab } from '../App'

interface SidebarProps {
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
  isOpen: boolean
  onToggle: () => void
}

const tabs: { id: Tab; label: string; icon: string; description: string }[] = [
  { id: 'coverage', label: 'Coverage', icon: '📊', description: 'All docs with filters' },
  { id: 'tree',     label: 'Tree',     icon: '🌳', description: 'Hierarchy editor' },
  { id: 'gaps',     label: 'Gaps',     icon: '🔍', description: 'Unpublished docs' },
  { id: 'planned',  label: 'Planned',  icon: '📋', description: 'Upcoming docs' },
]

function ChevronRight() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

function ChevronLeft() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function Sidebar({ activeTab, setActiveTab, isOpen, onToggle }: SidebarProps) {
  if (!isOpen) {
    return (
      <aside className="w-10 bg-white shadow-md flex flex-col items-center pt-4 shrink-0">
        <button onClick={onToggle} className="bg-blue-600 hover:bg-blue-700 text-white p-1 rounded">
          <ChevronRight />
        </button>
      </aside>
    )
  }

  return (
    <aside className="w-56 bg-white shadow-md flex flex-col shrink-0">
      <div className="p-5 border-b flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-800 leading-tight">Docs Coverage</h1>
          <p className="text-xs text-gray-400 mt-0.5">Vehicle OS</p>
        </div>
        <button onClick={onToggle} className="bg-blue-600 hover:bg-blue-700 text-white p-1 ml-2 shrink-0 rounded">
          <ChevronLeft />
        </button>
      </div>

      <nav className="flex-1 p-3">
        <ul className="space-y-1">
          {tabs.map((tab) => (
            <li key={tab.id}>
              <button
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="mr-2 text-base">{tab.icon}</span>
                <span className="text-sm">{tab.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-3 border-t">
        <p className="text-xs text-gray-400 text-center">doc-planner</p>
      </div>
    </aside>
  )
}

export default Sidebar
