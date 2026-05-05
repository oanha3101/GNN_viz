import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminOverviewPage from './AdminOverviewPage'

describe('AdminOverviewPage', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        users: 12,
        projects: 4,
        datasets: 6,
        experiments: 18,
        training_sessions: 21,
        active_sessions: 3,
        failed_sessions_recent: 2,
        retention_compacted_runs: 5,
        recent_audit_events: 11,
        blob_provider: 'local',
        mongo_available: true,
        redis_available: false,
      }),
    }))
  })

  it('renders admin summary stats from the backend', async () => {
    render(<AdminOverviewPage />)

    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getAllByText('21').length).toBeGreaterThan(0)
      expect(screen.getByText('5')).toBeInTheDocument()
      expect(screen.getByText('local')).toBeInTheDocument()
      expect(screen.getByText('online')).toBeInTheDocument()
      expect(screen.getByText('offline')).toBeInTheDocument()
      expect(screen.getByText('11')).toBeInTheDocument()
    })
  })
})
