import { expect, test } from '@playwright/test'

const API_BASE = 'http://localhost:8000/api'

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function registerViaUi(page, { email, username, password, fullName }) {
  await page.goto('/register')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Full name').fill(fullName)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.locator('.auth-submit').click()
  await page.waitForURL(/\/app\/dashboard$/, { timeout: 15000 })
}

async function getToken(page) {
  return page.evaluate(() => localStorage.getItem('gnn_access_token'))
}

async function apiJson(request, path, { method = 'GET', token, data } = {}) {
  const response = await request.fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    data,
  })

  const payload = await response.json()
  expect(response.ok(), `${method} ${path} failed: ${JSON.stringify(payload)}`).toBeTruthy()
  return payload
}

async function createGovernedContext(request, token) {
  const project = await apiJson(request, '/projects', {
    method: 'POST',
    token,
    data: {
      title: `Project ${uniqueId('live')}`,
      description: 'Playwright replay project',
      task_type: 1,
      model_type: 'GCN',
    },
  })

  const datasetCreate = await apiJson(request, '/datasets', {
    method: 'POST',
    token,
    data: {
      name: `Dataset ${uniqueId('live')}`,
      description: 'Playwright replay dataset',
      summary_json: { source: 'playwright' },
    },
  })

  const version = await apiJson(
    request,
    `/datasets/${datasetCreate.dataset.id}/publish?version_id=${datasetCreate.version.id}`,
    { method: 'POST', token }
  )

  return {
    project,
    datasetVersionId: version.id,
  }
}

async function saveExperiment(request, token, context, { title, history }) {
  return apiJson(request, '/experiments', {
    method: 'POST',
    token,
    data: {
      title,
      task_type: 1,
      model_type: 'GCN',
      dataset_name: 'cora',
      epoch_count: history.length,
      learning_rate: 0.01,
      hidden_dim: 32,
      dropout: 0.5,
      accuracy: history.at(-1)?.score ?? 0,
      loss: history.at(-1)?.loss ?? 0,
      best_epoch: history.length - 1,
      project_id: context.project.id,
      dataset_version_id: context.datasetVersionId,
      snapshots_json: history.map((point) => ({
        epoch: point.epoch,
        train_loss: point.loss,
        accuracy: point.score,
      })),
      graph_data_json: {
        nodes: [{ id: 0, label: 'Node 0' }, { id: 1, label: 'Node 1' }, { id: 2, label: 'Node 2' }],
        links: [{ source: 0, target: 1 }, { source: 1, target: 2 }],
      },
      ground_truth_json: [0, 1, 0],
      task_data_json: { task: 1, source: 'playwright-replay' },
      config_json: { task: 1, model: 'GCN', dataset: 'cora', epochs: history.length, lr: 0.01, hidden: 32 },
      notes: 'Replay seek coverage',
      is_mock: false,
    },
  })
}

function buildNodeFile() {
  return {
    name: 'nodes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify([
      { node_id: 1, label: 'A', feature_1: 1.0, feature_2: 0.0 },
      { node_id: 2, label: 'B', feature_1: 0.0, feature_2: 1.0 },
      { node_id: 3, label: 'A', feature_1: 1.0, feature_2: 1.0 },
      { node_id: 4, label: 'B', feature_1: 0.5, feature_2: 1.2 },
    ])),
  }
}

function buildEdgeFile() {
  return {
    name: 'edges.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify([
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 4, target: 1 },
      { source: 1, target: 3 },
    ])),
  }
}

test.describe('Live training recovery and replay seek flows', () => {
  test('researcher can start live training, refresh, recover session context, and keep player history', async ({ page }) => {
    const researcher = {
      email: `${uniqueId('researcher')}@example.com`,
      username: uniqueId('researcher'),
      password: 'TestPass123!',
      fullName: 'Researcher Live Training',
    }
    const projectTitle = `Project ${uniqueId('lab')}`

    page.on('dialog', async (dialog) => {
      await dialog.accept()
    })

    await registerViaUi(page, researcher)
    await expect(page).toHaveURL(/\/app\/dashboard$/)

    await page.goto('/app/projects')
    await page.getByRole('button', { name: /create project/i }).first().click()
    await page.getByPlaceholder('Project title').fill(projectTitle)
    await page.getByPlaceholder('Short description').fill('Live training recoverability project')
    await page.getByRole('button', { name: /create project/i }).click()
    await expect(page.getByText(projectTitle)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Active' })).toBeVisible()

    await page.goto('/app/lab')
    await page.getByTestId('sidebar-config').click()
    await page.getByTestId('config-epochs-range').evaluate((element) => {
      element.value = '10'
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.getByTestId('config-close').click()

    await page.getByTestId('sidebar-data-load').click()
    await expect(page.getByText(/custom dataset configuration/i)).toBeVisible()

    await page.getByTestId('upload-nodes-file').setInputFiles(buildNodeFile())
    await page.getByTestId('upload-edges-file').setInputFiles(buildEdgeFile())
    await page.getByTestId('data-input-continue').click()
    await page.getByTestId('data-input-continue').click()
    await page.getByTestId('data-input-continue').click()
    await expect(page.getByTestId('data-input-confirm')).toBeEnabled({ timeout: 15000 })
    await page.getByTestId('data-input-confirm').click()
    await expect(page.getByText(/custom dataset configuration/i)).toHaveCount(0, { timeout: 15000 })

    const createSessionResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/sessions') && response.request().method() === 'POST'
    )
    await page.getByRole('button', { name: /run/i }).click()
    const sessionResponse = await createSessionResponse
    const sessionPayload = await sessionResponse.json()
    await expect(page.getByRole('button', { name: /stop training/i })).toBeVisible()
    await expect.poll(async () => {
      const text = await page.getByTestId('player-total-epochs').textContent()
      return Number(text || 0)
    }, { timeout: 30000 }).toBeGreaterThan(1)

    await page.evaluate((sessionId) => {
      localStorage.setItem('gnn_last_session', JSON.stringify({
        sessionId,
        lastEpoch: -1,
        lastSeq: -1,
        disconnectedAt: Date.now(),
      }))
    }, sessionPayload.session_id)

    await page.reload()
    await expect(page).toHaveURL(/\/app\/lab$/)

    await expect.poll(async () => {
      const text = await page.getByTestId('player-total-epochs').textContent()
      return Number(text || 0)
    }, { timeout: 30000 }).toBeGreaterThan(1)

    await page.getByTestId('player-step-forward').click()
    await expect.poll(async () => {
      const text = await page.getByTestId('player-current-epoch').textContent()
      return Number(text || 0)
    }, { timeout: 5000 }).toBeGreaterThan(0)
  })

  test('researcher can load replay and seek through the timeline controls', async ({ page, request }) => {
    const researcher = {
      email: `${uniqueId('researcher')}@example.com`,
      username: uniqueId('researcher'),
      password: 'TestPass123!',
      fullName: 'Researcher Replay Seek',
    }

    await registerViaUi(page, researcher)
    await expect(page).toHaveURL(/\/app\/dashboard$/)

    const token = await getToken(page)
    expect(token).toBeTruthy()

    const context = await createGovernedContext(request, token)
    const experimentTitle = `Experiment ${uniqueId('seek')}`
    await saveExperiment(request, token, context, {
      title: experimentTitle,
      history: [
        { epoch: 0, loss: 0.9, score: 0.4 },
        { epoch: 1, loss: 0.6, score: 0.6 },
        { epoch: 2, loss: 0.3, score: 0.8 },
        { epoch: 3, loss: 0.2, score: 0.85 },
      ],
    })

    await page.goto('/app/experiments')
    await page.getByText(experimentTitle, { exact: true }).click()
    await page.getByTestId('detail-load-replay').click()
    await expect(page).toHaveURL(/\/app\/lab$/)

    await expect(page.getByTestId('player-total-epochs')).toHaveText('4')
    await expect(page.getByTestId('player-current-epoch')).toHaveText('0.0')

    await page.getByTestId('player-step-forward').click()
    await expect(page.getByTestId('player-current-epoch')).toHaveText('1.0')

    await page.getByTestId('player-seek-end').click()
    await expect(page.getByTestId('player-current-epoch')).toHaveText('3.0')

    await page.getByTestId('player-seek-start').click()
    await expect(page.getByTestId('player-current-epoch')).toHaveText('0.0')
  })
})
