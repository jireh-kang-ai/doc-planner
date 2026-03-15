import { useState } from 'react'
import SlackBotTab from './SlackBotTab'
import SlackUserTab from './SlackUserTab'
import GoogleDocsTab from './GoogleDocsTab'
import GoogleSheetsTab from './GoogleSheetsTab'
import GoogleCalendarTab from './GoogleCalendarTab'
import GoogleDriveTab from './GoogleDriveTab'
import GmailTab from './GmailTab'
import JiraTab from './JiraTab'
import ConfluenceTab from './ConfluenceTab'

type SubTab = 'slack-bot' | 'slack-user' | 'google-docs' | 'google-sheets' | 'google-calendar' | 'google-drive' | 'gmail' | 'jira' | 'confluence'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'google-calendar', label: 'Google Calendar' },
  { id: 'gmail', label: 'Gmail' },
  { id: 'google-docs', label: 'Google Docs' },
  { id: 'google-sheets', label: 'Google Sheets' },
  { id: 'google-drive', label: 'Google Drive' },
  { id: 'jira', label: 'Jira' },
  { id: 'confluence', label: 'Confluence' },
  { id: 'slack-user', label: 'Slack User' },
  { id: 'slack-bot', label: 'Slack Bot' },
]

function Integrations() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('google-calendar')

  const renderSubTab = () => {
    switch (activeSubTab) {
      case 'slack-bot': return <SlackBotTab />
      case 'slack-user': return <SlackUserTab />
      case 'google-docs': return <GoogleDocsTab />
      case 'google-sheets': return <GoogleSheetsTab />
      case 'google-calendar': return <GoogleCalendarTab />
      case 'google-drive': return <GoogleDriveTab />
      case 'gmail': return <GmailTab />
      case 'jira': return <JiraTab />
      case 'confluence': return <ConfluenceTab />
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Integrations</h2>
        <p className="text-gray-600 mt-1">Verify your integrations are connected and explore their data</p>
      </div>

      {/* Sub-tab nav */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeSubTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {renderSubTab()}
    </div>
  )
}

export default Integrations
