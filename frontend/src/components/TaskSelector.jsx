import useGNNStore from '../store/useGNNStore'

const tasks = [
  { id: 1, name: 'Node Classification', icon: '🔵' },
  { id: 2, name: 'Graph Classification', icon: '📊' },
  { id: 3, name: 'Link Prediction', icon: '🔗' },
  { id: 4, name: 'Community Detection', icon: '🏘️' },
  { id: 5, name: 'Graph Embedding', icon: '🧬' },
  { id: 6, name: 'Graph Generation', icon: '✨' },
]

export default function TaskSelector() {
  const selectedTask = useGNNStore((s) => s.selectedTask)
  const setTask = useGNNStore((s) => s.setTask)

  return (
    <select
      value={selectedTask}
      onChange={(e) => setTask(Number(e.target.value))}
      className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg
                 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
    >
      {tasks.map((t) => (
        <option key={t.id} value={t.id}>{t.icon} Task {t.id}: {t.name}</option>
      ))}
    </select>
  )
}
