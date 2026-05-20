import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminOverviewPage from './AdminOverviewPage'

vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts')
  const passthrough = ({ children }) => <div>{children}</div>
  return {
    ...actual,
    ResponsiveContainer: passthrough,
  }
})

function jsonResponse(payload) {
  return {
    ok: true,
    headers: {
      get: () => 'application/json',
    },
    json: async () => payload,
  }
}

describe('AdminOverviewPage', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        users: 14,
        projects: 5,
        datasets: 7,
        dataset_versions: 11,
        experiments: 9,
        training_sessions: 12,
        active_sessions: 3,
        failed_sessions_recent: 2,
        retention_compacted_runs: 4,
        recent_audit_events: 8,
        blob_provider: 'local',
        blob_object_count: 16,
        blob_orphan_count: 1,
        mongo_available: true,
        redis_available: false,
      })
    )
  })

  it('renders the upgraded overview dashboard sections', async () => {
    render(<AdminOverviewPage />)

    await waitFor(() => {
      expect(screen.getByText('Platform Pulse')).toBeInTheDocument()
    })

    expect(screen.getByText('Workspace Composition')).toBeInTheDocument()
    expect(screen.getByText('Execution Risk Surface')).toBeInTheDocument()
    expect(screen.getByText('Infrastructure Surface')).toBeInTheDocument()
    expect(screen.getByText('Operational Pressure')).toBeInTheDocument()
  })
})
