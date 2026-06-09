import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import ProfilePage from './ProfilePage'

const authState = {
  user: {
    id: 7,
    email: 'thi.huyen@example.com',
    username: 'thihuyen',
    full_name: 'Thi Huyen',
    bio: 'Researcher',
    github_url: '',
    organization: 'OpenAI Lab',
    job_title: 'ML Engineer',
    location: 'HCMC',
    profile_image: '',
    role: 'researcher',
    created_at: '2026-01-10T08:00:00.000Z',
  },
  updateProfile: vi.fn(() => Promise.resolve()),
  loading: false,
  error: '',
}

const apiJson = vi.fn(async (url) => {
  if (url.startsWith('/projects')) {
    return {
      items: [
        {
          id: 11,
          title: 'Cora Node Classification',
          description: 'Starter project',
          is_public: true,
          model_type: 'GraphSAGE',
          task_type: 1,
          created_at: '2026-02-04T00:00:00.000Z',
        },
      ],
    }
  }
  if (url.startsWith('/datasets')) {
    return {
      items: [
        {
          id: 21,
          name: 'Cora',
          description: 'Citation network benchmark',
          is_public: true,
          version_count: 3,
          current_version_summary: {
            num_nodes: 2708,
            num_edges: 5278,
          },
        },
      ],
    }
  }
  if (url.startsWith('/experiments')) {
    return {
      items: [
        {
          id: 31,
          title: 'Run Jan',
          project_id: 11,
          model_type: 'GraphSAGE',
          dataset_name: 'Cora',
          status: 'completed',
          accuracy: 0.912,
          created_at: '2026-01-12T00:00:00.000Z',
        },
        {
          id: 32,
          title: 'Run Dec',
          project_id: 11,
          model_type: 'GraphSAGE',
          dataset_name: 'Cora',
          status: 'completed',
          accuracy: 0.934,
          created_at: '2026-12-02T00:00:00.000Z',
        },
      ],
    }
  }
  return { items: [] }
})

const tMap = {
  'profile.unnamed': 'Unnamed',
  'profile.change_avatar': 'Change avatar',
  'common.change': 'Change',
  'profile.role_member': 'member',
  'profile.bio_empty': 'No bio',
  'profile.edit_profile': 'Edit profile',
  'profile.expertise_title': 'Expertise',
  'profile.tab_overview': 'Tổng quan',
  'profile.tab_projects': 'Dự án',
  'profile.tab_datasets': 'Tập dữ liệu',
  'profile.tab_experiments': 'Lần chạy',
  'profile.tab_settings': 'Cài đặt',
  'profile.pinned_items': 'Dự án ghim',
  'profile.no_projects_desc': 'No projects',
  'profile.public_badge': 'Công khai',
  'profile.private_badge': 'Riêng tư',
  'profile.no_datasets_desc': 'No datasets',
  'profile.no_experiments_desc': 'No experiments',
  'profile.stats_runs': 'Runs',
  'profile.heatmap_title': 'Hoạt động huấn luyện',
  'profile.joined': 'Joined',
  'tasks_meta.node_classification': 'Node Classification',
}

vi.mock('../../store/authStore', () => {
  const useAuthStore = (selector) => selector(authState)
  useAuthStore.getState = () => authState
  return { default: useAuthStore }
})

vi.mock('../../utils/api', () => ({
  apiJson: (...args) => apiJson(...args),
  normalizeCollectionPayload: (payload) => payload,
}))

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({
    lang: 'vi',
    t: (key) => tMap[key] || key,
  }),
}))

vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../components/ui/ThemeToggle', () => ({
  default: () => <div>theme-toggle</div>,
}))

vi.mock('../../components/ui/LanguageSwitcher', () => ({
  default: () => <div>language-switcher</div>,
}))

describe('ProfilePage', () => {
  beforeEach(() => {
    apiJson.mockClear()
    authState.updateProfile.mockClear()
  })

  it('renders fallback avatar, activity months, and upgraded dataset content', async () => {
    const { container } = render(<ProfilePage />)

    expect(screen.getByText('TH')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('T1')).toBeInTheDocument()
      expect(screen.getByText('T12')).toBeInTheDocument()
    })

    expect(Array.from(container.querySelectorAll('.profile-activity-count')).map((node) => node.textContent)).toEqual(['1', '1'])

    fireEvent.click(screen.getByRole('button', { name: /tập dữ liệu/i }))

    await waitFor(() => {
      expect(screen.getByText('Cora')).toBeInTheDocument()
      expect(screen.getByText('2708')).toBeInTheDocument()
      expect(screen.getByText('5278')).toBeInTheDocument()
      expect(screen.getByText('3 versions')).toBeInTheDocument()
    })
  })
})
