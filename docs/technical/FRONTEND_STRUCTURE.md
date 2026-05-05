# GNN-Insight Frontend Structure

## Purpose

This document explains how the frontend is split so new contributors can find
the right surface quickly and avoid rebuilding old overlay-style patterns.

## Route Model

- Public auth routes:
  - `/login`
  - `/register`
- Protected app routes:
  - `/app/dashboard`
  - `/app/projects`
  - `/app/datasets`
  - `/app/experiments`
  - `/app/lab`
- Protected admin routes:
  - `/admin/overview`
  - `/admin/users`
  - `/admin/datasets`
  - `/admin/experiments`
  - `/admin/sessions`
  - `/admin/retention`
  - `/admin/audit`

`frontend/src/App.jsx` is responsible for:

- auth bootstrap
- route guards
- redirects by role
- lazy loading page routes

## Folder Guide

### `frontend/src/layouts`

- `PublicAuthLayout.jsx`
- `AppLayout.jsx`
- `AdminLayout.jsx`

These are the shell boundaries for the product.

### `frontend/src/pages`

- `AuthPage.jsx`
- `ExperimentsPage.jsx`
- `pages/app/*`
- `pages/admin/*`
- `pages/shared/*`

Pages should stay page-first. Avoid turning them back into modal navigation
containers.

### `frontend/src/components`

- `Library/ExperimentHub.jsx`
- `Library/ProjectLibrary.jsx`
- `Admin/*`
- `Workspace/*`
- `primitives/*`

Use `primitives/*` and shared page blocks before introducing one-off visual
patterns.

### `frontend/src/store`

- `authStore.js`
- `sessionStore.js`
- `playerStore.js`
- `useGNNStore.js`

Keep cross-page runtime state here. Page-local state should remain inside pages
or domain components unless it truly affects the wider app shell.

### `frontend/src/utils`

- `api.js` for URLs, auth headers, collection normalization, feature flags
- `appRoutes.js` for role-aware redirects

Never hard-code backend URLs inside page or component files.

## Current Conventions

- App shell and admin shell are route-first, not overlay-first.
- `LabShell` remains the training workspace and can stay heavier than the rest
  of the app, but it should load lazily.
- `ExperimentHub` is the only main run-management surface and lives at
  `/app/experiments`.
- `LabShell` must navigate to `/app/experiments` for run management instead of
  mounting library modals inline.
- `ProjectLibrary` is now a legacy artifact only. It should stay out of the
  primary product flow and can be removed once no internal migration path
  depends on it.

## Performance Notes

- Route-level lazy loading is enabled in `App.jsx`.
- `LabShell` should lazy-load task-specific topology, metrics, embedding, and
  inspector panels so one task does not force every visualization bundle into
  the first `/app/lab` paint.
- Visualization-heavy bundles, especially Plotly, should stay off the initial
  auth/app shell path.
- If a new feature introduces a large chart dependency, prefer route or
  component-level splitting.
