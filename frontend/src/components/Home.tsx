import { Tab } from '../App'

interface HomeProps {
  setActiveTab: (tab: Tab) => void
}

function Home({ setActiveTab }: HomeProps) {
  return (
    <div className="max-w-5xl mx-auto mt-12 px-4">
      <div className="bg-white rounded-xl shadow p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Welcome to the agentic app template!
        </h1>

<section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Available Integrations</h2>
          <p className="text-gray-500 text-sm mb-3">
            Head to the{' '}
            <button onClick={() => setActiveTab('integrations')} className="text-blue-600 font-semibold hover:underline">
              Integrations
            </button>{' '}
            tab on the left to connect your accounts and try them out.
          </p>
          <div className="space-y-4">

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-1">Slack Bot</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Makes your app a bot in your Slack workspace. It can respond when someone @mentions
                it, answer slash commands (like <code className="bg-gray-100 px-1 rounded">/ask</code>),
                send proactive messages to channels or DMs, and react to events in real time.
                Use this if you want your app to <em>live inside Slack</em>.
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-1">Slack User</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Connects <em>your personal Slack account</em> to the app. Use this to read your
                channels, search past messages, browse your DMs, or list people in your workspace.
                Different from the bot — this acts as <em>you</em>, not as a separate bot account.
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-1">Google Sheets</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Read from and write to your spreadsheets. The app can pull data from any range,
                append new rows, update existing cells, or create a brand-new spreadsheet.
                Great for storing form responses, tracking data, or building lightweight dashboards.
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-1">Google Docs</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Read and write Google Docs. The app can fetch the full content of a document,
                create new documents, insert or replace text, and apply formatting.
                Useful for generating reports, drafting summaries, or filling in document templates.
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-1">Google Drive</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Browse and download files from your Google Drive. The app can list files and
                folders, search by name or type, read file metadata (owner, size, last modified),
                and download file contents. By default it's read-only — write access can be
                enabled if needed.
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-1">Google Calendar</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Read and manage your calendar events. The app can list upcoming events, create new
                events (with attendees, times, and reminders), update or delete existing events,
                and check availability. Works with your primary calendar and any calendar you own.
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-1">Gmail</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Read your email. The app can search your inbox, read message content and threads,
                and list your labels. By default it's read-only — sending email or managing
                labels requires extra permission that you'd grant when connecting.
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-1">Jira</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Read and update your Jira projects. The app can search issues using JQL, read
                issue details and comments, create new issues, post comments, and look up team
                members. Useful for building status dashboards or automating ticket creation.
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-1">Confluence</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Read and write Confluence pages. The app can list spaces, read page content,
                create new pages, and update existing ones. Useful for generating documentation,
                publishing meeting notes, or pulling wiki content into your app.
              </p>
            </div>

          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Changelog</h2>
          <div className="space-y-3">
            <div className="border border-gray-200 rounded-lg p-4">
              <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded mb-1">
                v1.0
              </span>
              <p className="text-gray-600 text-sm">First version of Agentic App Builder Template released!🎉</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default Home