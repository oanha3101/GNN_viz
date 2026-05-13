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
  await page.getByRole('button', { name: /tao tai khoan|create/i }).click()
  await page.waitForURL(/\/app\/dashboard$/, { timeout: 15000 })
}

async function loginViaUi(page, { username, password }) {
  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /dang nhap va vao workspace/i }).click()
  await page.waitForURL(/\/(app\/dashboard|admin\/overview)$/, { timeout: 15000 })
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
      title: `Project ${uniqueId('e2e')}`,
      description: 'Playwright governed project',
      task_type: 1,
      model_type: 'GCN',
    },
  })

  const datasetCreate = await apiJson(request, '/datasets', {
    method: 'POST',
    token,
    data: {
      name: `Dataset ${uniqueId('e2e')}`,
      description: 'Playwright governed dataset',
      summary_json: { source: 'playwright', nodes: 2, edges: 1 },
    },
  })

  const version = await apiJson(
    request,
    `/datasets/${datasetCreate.dataset.id}/publish?version_id=${datasetCreate.version.id}`,
    { method: 'POST', token }
  )

  return {
    projectId: project.id,
    datasetVersionId: version.id,
  }
}

async function createSession(request, token, context, overrides = {}) {
  return apiJson(request, '/sessions', {
    method: 'POST',
    token,
    data: {
      task: 1,
      model: 'GCN',
      dataset: 'cora',
      epochs: 3,
      lr: 0.01,
      hidden: 32,
      config: {},
      project_id: context.projectId,
      dataset_version_id: context.datasetVersionId,
      ...overrides,
    },
  })
}

async function updateSessionStatus(request, token, sessionId, status) {
  return apiJson(request, `/sessions/${sessionId}`, {
    method: 'PATCH',
    token,
    data: { status },
  })
}

async function saveExperiment(request, token, context, sessionId, { title, accuracy, loss, bestEpoch, history }) {
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
      accuracy,
      loss,
      best_epoch: bestEpoch,
      project_id: context.projectId,
      dataset_version_id: context.datasetVersionId,
      session_id: sessionId,
      snapshots_json: history.map((point) => ({
        epoch: point.epoch,
        train_loss: point.loss,
        accuracy: point.score,
      })),
      graph_data_json: {
        nodes: [{ id: 0, label: 'Node 0' }, { id: 1, label: 'Node 1' }],
        links: [{ source: 0, target: 1 }],
      },
      ground_truth_json: [0, 1],
      task_data_json: { task: 1, source: 'playwright' },
      config_json: { task: 1, model: 'GCN', dataset: 'cora', epochs: history.length, lr: 0.01, hidden: 32 },
      notes: 'Seeded by Playwright',
      is_mock: false,
    },
  })
}

function comparePanel(page) {
  return page.locator('section').filter({ has: page.getByText('Compare Runs') }).first()
}

test.describe('Experiment hub and admin operational flows', () => {
  test('researcher can review reports, compare runs, export artifacts, and load replay', async ({ page, request }) => {
    const researcher = {
      email: `${uniqueId('researcher')}@example.com`,
      username: uniqueId('researcher'),
      password: 'TestPass123!',
      fullName: 'Researcher E2E',
    }

    await registerViaUi(page, researcher)
    await expect(page).toHaveURL(/\/app\/dashboard$/)

    const token = await getToken(page)
    expect(token).toBeTruthy()

    const context = await createGovernedContext(request, token)
    const sessionA = await createSession(request, token, context)
    const sessionB = await createSession(request, token, context)

    const experimentATitle = `Experiment ${uniqueId('alpha')}`
    const experimentBTitle = `Experiment ${uniqueId('beta')}`

    const experimentA = await saveExperiment(request, token, context, sessionA.session_id, {
      title: experimentATitle,
      accuracy: 0.81,
      loss: 0.22,
      bestEpoch: 2,
      history: [
        { epoch: 0, loss: 0.91, score: 0.51 },
        { epoch: 1, loss: 0.45, score: 0.73 },
        { epoch: 2, loss: 0.22, score: 0.81 },
      ],
    })
    const experimentB = await saveExperiment(request, token, context, sessionB.session_id, {
      title: experimentBTitle,
      accuracy: 0.77,
      loss: 0.29,
      bestEpoch: 2,
      history: [
        { epoch: 0, loss: 1.02, score: 0.42 },
        { epoch: 1, loss: 0.58, score: 0.64 },
        { epoch: 2, loss: 0.29, score: 0.77 },
      ],
    })

    await page.goto('/app/experiments')
    await expect(page.getByRole('heading', { name: /experiment hub/i })).toBeVisible()

    await page.getByText(experimentATitle, { exact: true }).click()
    await expect(page.getByText(/Replay endpoint:/)).toBeVisible()
    await expect(page.getByText(/Primary metric:/)).toBeVisible()

    await page.locator('textarea').fill('Updated through browser E2E')
    await page.getByRole('button', { name: /notes/i }).click()
    await expect(page.locator('div').filter({ hasText: /^Updated through browser E2E$/ }).first()).toBeVisible()

    const jsonDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /^JSON$/ }).click()
    const jsonDownload = await jsonDownloadPromise
    expect(await jsonDownload.suggestedFilename()).toMatch(/\.json$/)

    const markdownDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /^Markdown$/ }).click()
    const markdownDownload = await markdownDownloadPromise
    expect(await markdownDownload.suggestedFilename()).toMatch(/\.md$/)

    await page.getByTestId(`experiment-compare-toggle-${experimentA.id}`).click()
    await page.getByTestId(`experiment-compare-toggle-${experimentB.id}`).click()
    await comparePanel(page).getByRole('button', { name: /so sanh|so sánh/i }).click()
    await expect(comparePanel(page).getByText(experimentATitle, { exact: true }).first()).toBeVisible()
    await expect(comparePanel(page).getByText(experimentBTitle, { exact: true }).first()).toBeVisible()

    await page.getByRole('button', { name: /load replay/i }).click()
    await expect(page).toHaveURL(/\/app\/lab$/)
    await expect(page.getByText('Ready')).toBeVisible()
  })

  test('admin can stop and retry a session from the session monitor', async ({ page, request }) => {
    const admin = {
      email: `${uniqueId('admin')}@example.com`,
      username: uniqueId('admin'),
      password: 'AdminPass123!',
      fullName: 'Admin E2E',
      role: 'admin',
    }
    const researcher = {
      email: `${uniqueId('researcher')}@example.com`,
      username: uniqueId('researcher'),
      password: 'TestPass123!',
      fullName: 'Researcher Session E2E',
    }

    await apiJson(request, '/auth/register', {
      method: 'POST',
      data: admin,
    })

    await registerViaUi(page, researcher)
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    const researcherToken = await getToken(page)
    expect(researcherToken).toBeTruthy()

    const context = await createGovernedContext(request, researcherToken)
    const session = await createSession(request, researcherToken, context)
    await updateSessionStatus(request, researcherToken, session.session_id, 'running')

    await page.getByRole('button', { name: /log out/i }).click()
    await expect(page).toHaveURL(/\/login$/)

    await loginViaUi(page, admin)
    await expect(page).toHaveURL(/\/admin\/overview$/)

    await page.goto('/admin/sessions')
    const sessionCard = page.getByTestId(`admin-session-${session.session_id}`)
    await expect(sessionCard).toContainText('Status: running')

    await page.getByTestId(`admin-session-stop-${session.session_id}`).click()
    await expect(sessionCard).toContainText('Status: stopped')

    await page.getByTestId(`admin-session-retry-${session.session_id}`).click()
    await expect(sessionCard).toContainText('Status: pending')
  })
})
