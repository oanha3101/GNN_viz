import { Network, BarChart3, Link2, Users } from 'lucide-react'
import useGNNStore from '../store/useGNNStore'

const TASKS = [
  { id: 1, label: 'Phân loại nút', icon: Network },
  { id: 2, label: 'Phân loại đồ thị', icon: BarChart3 },
  { id: 3, label: 'Dự đoán liên kết', icon: Link2 },
  { id: 4, label: 'Phát hiện cộng đồng', icon: Users },
]

export default function TaskSelectorV2() {
  const selectedTask = useGNNStore((s) => s.selectedTask)
  const setTask = useGNNStore((s) => s.setTask)

  const currentTask = TASKS.find((t) => t.id === selectedTask) || TASKS[0]
  const CurrentIcon = currentTask?.icon || Network

  return (
    <label className="flex items-center gap-2 rounded-2xl border border-line-default/50 bg-deep/65 px-3 py-2">
      <CurrentIcon size={14} className="text-cyan-400 shrink-0" />
      <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Task</span>
      <select
        value={currentTask.id}
        onChange={(e) => setTask(Number(e.target.value))}
        className="bg-transparent text-sm text-slate-100 outline-none cursor-pointer"
      >
        {TASKS.map((task) => (
          <option key={task.id} value={task.id} className="bg-nebula">
            {`${task.id}: ${task.label}`}
          </option>
        ))}
      </select>
    </label>
  )
}
