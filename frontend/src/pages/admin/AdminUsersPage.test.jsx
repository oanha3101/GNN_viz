import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminUsersPage from './AdminUsersPage'

function jsonResponse(payload) {
  return {
    ok: true,
    headers: {
      get: () => 'application/json',
    },
    json: async () => payload,
  }
}

function getDialog(name) {
  return screen.getByRole('complementary')
}

describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            id: 7,
            username: 'alice',
            email: 'alice@example.com',
            full_name: 'Alice Nguyen',
            organization: 'Graph Lab',
            job_title: 'Researcher',
            bio: 'Builds graph tooling.',
            github_url: 'https://github.com/alice',
            location: 'Da Nang',
            profile_image: 'https://example.com/alice.png',
            role: 'researcher',
            is_active: true,
            created_at: '2026-05-13T00:00:00Z',
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: 7,
        username: 'alice',
        email: 'alice@example.com',
        full_name: 'Alice Nguyen',
        organization: 'Updated Lab',
        job_title: 'Staff Researcher',
        bio: 'Updated bio',
        github_url: 'https://github.com/alice',
        location: 'Hue',
        profile_image: 'https://example.com/alice-updated.png',
        role: 'viewer',
        is_active: false,
        created_at: '2026-05-13T00:00:00Z',
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            id: 7,
            username: 'alice',
            email: 'alice@example.com',
            full_name: 'Alice Nguyen',
            organization: 'Updated Lab',
            job_title: 'Staff Researcher',
            bio: 'Updated bio',
            github_url: 'https://github.com/alice',
            location: 'Hue',
            profile_image: 'https://example.com/alice-updated.png',
            role: 'viewer',
            is_active: false,
            created_at: '2026-05-13T00:00:00Z',
          },
        ],
      }))
  })

  it('saves role and active status changes', async () => {
    render(<AdminUsersPage />)

    await waitFor(() => {
      expect(screen.getByText('Alice Nguyen')).toBeInTheDocument()
    })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/users?page=1&page_size=12'),
      expect.any(Object)
    )

    fireEvent.click(screen.getByRole('button', { name: /edit user/i }))
    const dialog = getDialog()
    fireEvent.change(within(dialog).getByLabelText(/^organization$/i), {
      target: { value: 'Updated Lab' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^job title$/i), {
      target: { value: 'Staff Researcher' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^location$/i), {
      target: { value: 'Hue' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^avatar url$/i), {
      target: { value: 'https://example.com/alice-updated.png' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^bio$/i), {
      target: { value: 'Updated bio' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^role$/i), {
      target: { value: 'viewer' },
    })
    fireEvent.click(within(dialog).getByLabelText(/^active$/i))
    fireEvent.click(within(dialog).getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/users/7',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            email: 'alice@example.com',
            username: 'alice',
            full_name: 'Alice Nguyen',
            bio: 'Updated bio',
            github_url: 'https://github.com/alice',
            organization: 'Updated Lab',
            job_title: 'Staff Researcher',
            location: 'Hue',
            profile_image: 'https://example.com/alice-updated.png',
            role: 'viewer',
            is_active: false,
          }),
        })
      )
    })
  })

  it('deletes a user from the admin page', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            id: 9,
            username: 'bob',
            email: 'bob@example.com',
            role: 'viewer',
            is_active: true,
            created_at: '2026-05-13T00:00:00Z',
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'deleted',
        id: 9,
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [],
      }))

    render(<AdminUsersPage />)

    await waitFor(() => {
      expect(screen.getByText('bob')).toBeInTheDocument()
    })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/users?page=1&page_size=12'),
      expect.any(Object)
    )

    fireEvent.click(screen.getByRole('button', { name: /delete user/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/users/9',
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })
  })

  it('creates a user from the admin page', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        items: [],
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: 12,
        username: 'newbie',
        email: 'newbie@example.com',
        role: 'viewer',
        is_active: true,
        created_at: '2026-05-13T00:00:00Z',
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            id: 12,
            username: 'newbie',
            email: 'newbie@example.com',
            organization: 'New Org',
            job_title: 'Analyst',
            location: 'HCMC',
            github_url: 'https://github.com/newbie',
            bio: 'New user bio',
            profile_image: 'https://example.com/newbie.png',
            role: 'viewer',
            is_active: true,
            created_at: '2026-05-13T00:00:00Z',
          },
        ],
      }))

    render(<AdminUsersPage />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/users?page=1&page_size=12'),
        expect.any(Object)
      )
    })

    fireEvent.click(screen.getByRole('button', { name: /new user/i }))

    const dialog = getDialog()
    fireEvent.change(within(dialog).getByLabelText(/^email/i), {
      target: { value: 'newbie@example.com' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^username/i), {
      target: { value: 'newbie' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^full name$/i), {
      target: { value: 'New User' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^password/i), {
      target: { value: 'password123' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^organization$/i), {
      target: { value: 'New Org' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^job title$/i), {
      target: { value: 'Analyst' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^location$/i), {
      target: { value: 'HCMC' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^github url$/i), {
      target: { value: 'https://github.com/newbie' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^avatar url$/i), {
      target: { value: 'https://example.com/newbie.png' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^bio$/i), {
      target: { value: 'New user bio' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^role$/i), {
      target: { value: 'viewer' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /create user/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'newbie@example.com',
            username: 'newbie',
            full_name: 'New User',
            password: 'password123',
            bio: 'New user bio',
            github_url: 'https://github.com/newbie',
            organization: 'New Org',
            job_title: 'Analyst',
            location: 'HCMC',
            profile_image: 'https://example.com/newbie.png',
            role: 'viewer',
            is_active: true,
          }),
        })
      )
    })
  })
})
