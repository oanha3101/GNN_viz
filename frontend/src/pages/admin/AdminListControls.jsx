import { ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react'

const PAGE_SIZE_OPTIONS = [8, 12, 24, 48]

export function buildAdminListPath(basePath, params = {}) {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }
    searchParams.set(key, String(value))
  })
  const query = searchParams.toString()
  return query ? `${basePath}?${query}` : basePath
}

export function AdminListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search',
  dateFrom = '',
  dateTo = '',
  onDateFromChange,
  onDateToChange,
  pageSize = 12,
  onPageSizeChange,
  onRefresh,
  onClear,
  extraControls = null,
  showDateFilters = false,
}) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-twilight" />
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="input-cosmic w-full pl-9 text-sm"
          />
        </label>
        {showDateFilters ? (
          <>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => onDateFromChange(event.target.value)}
              className="input-cosmic text-sm"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(event) => onDateToChange(event.target.value)}
              className="input-cosmic text-sm"
            />
          </>
        ) : null}
        {extraControls}
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="input-cosmic text-sm"
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} / page
            </option>
          ))}
        </select>
        <button type="button" onClick={onRefresh} className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs">
          <RefreshCw size={13} /> Refresh
        </button>
        <button type="button" onClick={onClear} className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs">
          <X size={13} /> Clear
        </button>
      </div>
    </div>
  )
}

export function AdminPagination({ page, pageSize, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = total === 0 ? 0 : Math.min(page * pageSize, total)

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-4 text-xs text-twilight">
      <div>
        Showing <span className="text-starlight">{from}-{to}</span> of <span className="text-starlight">{total}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="btn-ghost inline-flex items-center gap-1 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft size={13} /> Prev
        </button>
        <span className="rounded-lg border border-line-subtle bg-deep px-3 py-2 text-starlight">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="btn-ghost inline-flex items-center gap-1 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}
