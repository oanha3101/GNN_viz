import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from './DashboardPage'

const navigate = vi.fn()
const apiJson = vi.fn(async (url) => {
  if (url.startsWith('/projects')) {
    return {
      items: [
        { id: 11, title: 'Graph Bench', description: 'Main stream' },
      ],
    }
  }
  if (url.startsWith('/datasets')) {
    return {
      items: [
        { id: 21, name: 'Cora' },
      ],
    }
  }
  if (url.startsWith('/experiments')) {
    return {
      items: [
        {
          id: 31,
          title: 'Run A',
          project_id: 11,
          task_type: 4,
          model_type: 'GCN',
          dataset_name: 'Cora',
          status: 'completed',
          accuracy: 0.9321,
          loss: 0.184,
          created_at: '2026-06-08T05:00:00.000Z',
        },
      ],
    }
  }
  return { items: [] }
})

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}))

vi.mock('../../store/useGNNStore', () => {
  const state = {
    activeProjectId: null,
    activeProjectName: null,
    activeDatasetVersionId: null,
    activeDatasetVersionName: null,
    uploadedFilePath: null,
  }
  const useGNNStore = (selector) => selector(state)
  return { default: useGNNStore }
})

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({
    lang: 'vi',
    t: (key, vars) => {
      const map = {
        'dashboard.loading_dashboard': 'Đang tải',
        'dashboard.load_error': 'Lỗi tải',
        'dashboard.stat_projects': 'Dự án',
        'dashboard.stat_datasets': 'Tập dữ liệu',
        'dashboard.stat_experiments': 'Thí nghiệm',
        'dashboard.avg_accuracy': 'Độ chính xác trung bình',
        'dashboard.training_activity_eyebrow': 'Hoạt động huấn luyện',
        'dashboard.training_activity_title': 'Phiên chạy 7 ngày qua',
        'dashboard.training_activity_sub': 'Mô tả',
        'dashboard.total_runs': 'Tổng phiên chạy',
        'dashboard.task_distribution_eyebrow': 'Phân bố tác vụ',
        'dashboard.task_distribution_title': 'Phân bố',
        'dashboard.task_distribution_sub': 'Mô tả',
        'dashboard.runs': 'phiên',
        'dashboard.recent_eyebrow': 'Thí nghiệm gần đây',
        'dashboard.recent_title': 'Phiên huấn luyện mới nhất',
        'dashboard.recent_sub': 'Thí nghiệm mới nhất trong không gian làm việc.',
        'dashboard.open_all': 'Mở tất cả',
        'dashboard.no_experiments': 'Chưa có',
        'dashboard.no_experiments_desc': 'Mô tả',
        'dashboard.recent_project_label': 'Dự án',
        'dashboard.recent_dataset_label': 'Tập dữ liệu',
        'dashboard.recent_accuracy_label': 'độ chính xác',
        'dashboard.recent_loss_label': 'loss',
        'dashboard.recent_project_missing': 'Chưa gắn dự án',
        'dashboard.recent_dataset_missing': 'Chưa rõ tập dữ liệu',
        'dashboard.just_now': 'vừa xong',
        'dashboard.minutes_ago': `${vars?.n} phút trước`,
        'dashboard.hours_ago': `${vars?.n} giờ trước`,
        'dashboard.days_ago': `${vars?.n} ngày trước`,
        'dashboard.readiness_eyebrow': 'Sẵn sàng',
        'dashboard.readiness_title': 'Checklist',
        'dashboard.ready': 'sẵn sàng',
        'dashboard.ck_select_project': 'Chọn dự án',
        'dashboard.ck_select_dataset': 'Chọn dataset',
        'dashboard.ck_upload_meta': 'Upload metadata',
        'dashboard.ck_upload_done': 'Có metadata',
        'dashboard.quick_eyebrow': 'Thao tác nhanh',
        'dashboard.quick_title': 'Đi tới',
        'dashboard.quick_projects_desc': 'Projects',
        'dashboard.quick_datasets_desc': 'Datasets',
        'dashboard.quick_lab_desc': 'Lab',
        'dashboard.quick_experiments_desc': 'Experiments',
        'dashboard.open_lab': 'Mở Lab',
        'dashboard.untitled_run': 'Phiên chạy chưa đặt tên',
        'status.completed': 'Hoàn tất',
        'tasks_meta.community_detection': 'Phát hiện cộng đồng',
        'nav.projects': 'Dự án',
        'nav.datasets': 'Tập dữ liệu',
        'nav.lab': 'Lab',
        'nav.experiments': 'Thí nghiệm',
      }
      return map[key] || key
    },
  }),
}))

vi.mock('../../utils/api', () => ({
  apiJson: (...args) => apiJson(...args),
  normalizeCollectionPayload: (payload) => payload,
}))

describe('DashboardPage', () => {
  beforeEach(() => {
    apiJson.mockClear()
    navigate.mockReset()
  })

  it('renders richer recent experiment context with project and dataset info', async () => {
    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Run A')).toBeInTheDocument()
    })

    expect(screen.getByText('Graph Bench')).toBeInTheDocument()
    expect(screen.getByText('Cora')).toBeInTheDocument()
    expect(screen.getByText('93.2%')).toBeInTheDocument()
    expect(screen.getByText('loss: 0.184')).toBeInTheDocument()
  })
})
