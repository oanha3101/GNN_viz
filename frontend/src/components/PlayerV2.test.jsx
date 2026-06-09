import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PlayerV2 from './PlayerV2'

const playerState = {
  snapshots: [{ epoch: 0, epochs_target: 100 }, { epoch: 4, epochs_target: 100 }, { epoch: 8, epochs_target: 100 }],
  currentEpochFloat: 1,
  isPlaying: false,
  playbackSpeed: 1,
  trainingDone: true,
  bestEpoch: 1,
  totalEpochs: 3,
  configuredEpochs: 100,
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  stepForward: vi.fn(),
  stepBack: vi.fn(),
  setSpeed: vi.fn(),
}

const gnnState = {
  isTraining: false,
  userRole: 'researcher',
}

vi.mock('../store/playerStore', () => ({
  default: () => playerState,
}))

vi.mock('../store/useGNNStore', () => ({
  default: (selector) => selector(gnnState),
}))

describe('PlayerV2', () => {
  beforeEach(() => {
    playerState.play.mockClear()
    playerState.pause.mockClear()
    playerState.seekTo.mockClear()
    playerState.stepForward.mockClear()
    playerState.stepBack.mockClear()
    playerState.setSpeed.mockClear()
    playerState.isPlaying = false
    playerState.playbackSpeed = 1
    playerState.trainingDone = true
    playerState.totalEpochs = 3
    playerState.configuredEpochs = 100
    gnnState.isTraining = false
  })

  it('uses theme classes for the player and keeps the play icon white', () => {
    const { container } = render(<PlayerV2 />)

    expect(container.querySelector('.lab-player-track')).toBeTruthy()
    expect(container.querySelector('.lab-player-fill')).toBeTruthy()
    expect(container.querySelector('.lab-player-thumb')).toBeTruthy()

    const toggle = screen.getByTestId('player-toggle-play')
    expect(toggle.className).toContain('lab-player-toggle-active')

    const playIcon = toggle.querySelector('svg')
    expect(playIcon?.getAttribute('class') || '').toContain('lab-player-toggle-icon')

    const seekBack = screen.getByTestId('player-seek-start')
    const rewind = screen.getByTestId('player-step-back')
    const fastForward = screen.getByTestId('player-step-forward')
    const seekEnd = screen.getByTestId('player-seek-end')
    expect(seekBack.className).toContain('lab-player-secondary')
    expect(rewind.className).toContain('lab-player-secondary')
    expect(fastForward.className).toContain('lab-player-secondary')
    expect(seekEnd.className).toContain('lab-player-secondary')
  })

  it('uses theme-selected speed chip styling for the active speed', () => {
    const { container } = render(<PlayerV2 />)
    const activeSpeed = screen.getByRole('button', { name: '1x' })
    expect(activeSpeed.className).toContain('lab-player-speed-active')
    expect(container.querySelector('.lab-player-speed-wrap')).toBeTruthy()
  })

  it('calls setSpeed when selecting another playback speed', () => {
    render(<PlayerV2 />)
    fireEvent.click(screen.getByRole('button', { name: '2x' }))
    expect(playerState.setSpeed).toHaveBeenCalledWith(2)
  })

  it('shows configured epochs separately from snapshot frames', () => {
    render(<PlayerV2 />)

    expect(screen.getByTestId('player-current-epoch').textContent).toBe('4.0')
    expect(screen.getByTestId('player-total-epochs').textContent).toBe('100')
    expect(screen.getByTestId('player-total-frames').textContent).toBe('3')
  })
})
