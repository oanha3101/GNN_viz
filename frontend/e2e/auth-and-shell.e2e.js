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

test.describe('Auth-first shell flows', () => {
  test('anonymous users see the public landing page and can reach /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible()
    await page.getByRole('link', { name: /sign in/i }).first().click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: /graph work, grounded/i })).toBeVisible()
  })

  test('researcher can create governed context and admin can inspect the resulting experiment', async ({ page, request }) => {
    const researcher = {
      email: `${uniqueId('researcher')}@example.com`,
      username: uniqueId('researcher'),
      password: 'TestPass123!',
      fullName: 'Researcher Flow',
    }
    const admin = {
      email: `${uniqueId('admin')}@example.com`,
      username: uniqueId('admin'),
      password: 'AdminPass123!',
      fullName: 'Admin Flow',
      role: 'admin',
    }
    const projectTitle = `Project ${uniqueId('phase1')}`
    const datasetName = `Dataset ${uniqueId('phase1')}`
    const experimentTitle = `Experiment ${uniqueId('phase1')}`

    await apiJson(request, '/auth/register', {
      method: 'POST',
      data: admin,
    })

    await registerViaUi(page, researcher)
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(page.getByRole('heading', { name: /research dashboard/i })).toBeVisible()

    await page.goto('/app/projects')
    await page.getByPlaceholder('Project title').fill(projectTitle)
    await page.getByPlaceholder('Short description').fill('Phase 1 governed project')
    await page.getByRole('button', { name: /^Create$/ }).click()
    await expect(page.getByText(projectTitle)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Active' })).toBeVisible()

    await page.goto('/app/datasets')
    await page.getByPlaceholder('Dataset name').fill(datasetName)
    await page.getByPlaceholder('Dataset description').fill('Phase 1 governed dataset')
    await page.getByRole('button', { name: /create dataset/i }).click()
    await expect(page.getByRole('button', { name: datasetName })).toBeVisible()
    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByText(/v1/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Active' })).toBeVisible()

    const researcherToken = await getToken(page)
    expect(researcherToken).toBeTruthy()

    const projects = await apiJson(request, '/projects', { token: researcherToken })
    const project = projects.items.find((item) => item.title === projectTitle)
    expect(project).toBeTruthy()

    const datasets = await apiJson(request, '/datasets', { token: researcherToken })
    const dataset = datasets.items.find((item) => item.name === datasetName)
    expect(dataset).toBeTruthy()
    const datasetDetail = await apiJson(request, `/datasets/${dataset.id}`, { token: researcherToken })
    const publishedVersion = datasetDetail.versions.find((item) => item.lifecycle === 'published')
    expect(publishedVersion).toBeTruthy()

    const session = await apiJson(request, '/sessions', {
      method: 'POST',
      token: researcherToken,
      data: {
        task: 1,
        model: 'GCN',
        dataset: 'cora',
        project_id: project.id,
        dataset_version_id: publishedVersion.id,
        epochs: 3,
        lr: 0.01,
        hidden: 32,
        config: {},
      },
    })

    await apiJson(request, '/experiments', {
      method: 'POST',
      token: researcherToken,
      data: {
        title: experimentTitle,
        task_type: 1,
        model_type: 'GCN',
        dataset_name: 'cora',
        epoch_count: 3,
        learning_rate: 0.01,
        hidden_dim: 32,
        dropout: 0.5,
        accuracy: 0.81,
        loss: 0.22,
        best_epoch: 2,
        project_id: project.id,
        dataset_version_id: publishedVersion.id,
        session_id: session.session_id,
        snapshots_json: [
          { epoch: 0, train_loss: 1.0, accuracy: 0.45 },
          { epoch: 1, train_loss: 0.55, accuracy: 0.68 },
          { epoch: 2, train_loss: 0.22, accuracy: 0.81 },
        ],
        graph_data_json: { nodes: [{ id: 0 }, { id: 1 }], links: [] },
        ground_truth_json: [0, 1],
        task_data_json: { task: 1 },
        is_mock: false,
      },
    })

    await page.getByRole('button', { name: /log out/i }).click()
    await expect(page).toHaveURL(/\/login$/)

    await loginViaUi(page, admin)
    await expect(page).toHaveURL(/\/admin\/overview$/)
    await expect(page.getByRole('heading', { name: /system overview/i })).toBeVisible()

    await page.goto('/admin/experiments')
    await expect(page.getByRole('heading', { name: /experiment governance/i })).toBeVisible()
    await expect(page.getByText(experimentTitle)).toBeVisible()

    await page.goto('/app/experiments')
    await expect(page.getByRole('heading', { name: /experiment hub/i })).toBeVisible()
    await expect(page.getByText(experimentTitle)).toBeVisible()
  })
})
