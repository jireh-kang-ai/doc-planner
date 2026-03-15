import { useState } from 'react'
import Sidebar from './components/Sidebar'
import DocsCoverage from './components/DocsCoverage'
import DocsTree from './components/DocsTree'
import DocsGaps from './components/DocsGaps'
import DocsPlanned from './components/DocsPlanned'

export type Tab = 'coverage' | 'tree' | 'gaps' | 'planned'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('coverage')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const renderContent = () => {
    switch (activeTab) {
      case 'coverage': return <DocsCoverage />
      case 'tree':     return <DocsTree />
      case 'gaps':     return <DocsGaps />
      case 'planned':  return <DocsPlanned />
      default:         return <DocsCoverage />
    }
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(v => !v)}
      />
      <main className="flex-1 overflow-hidden flex flex-col">
        {renderContent()}
      </main>
    </div>
  )
}

export default App
