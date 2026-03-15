import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'

function App() {
  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <MainContent />
    </div>
  )
}

export default App
