import useGNNStore from '../store/useGNNStore'

const TASKS = [
  { id: 1, label: 'Phân loại nút' },
  { id: 2, label: 'Phân loại đồ thị' },
  { id: 3, label: 'Dự đoán liên kết' },
  { id: 4, label: 'Phát hiện cộng đồng' },
  { id: 5, label: 'Biểu diễn đồ thị' },
  { id: 6, label: 'Sinh đồ thị' },
]

export default function TaskSelectorV2() {
  const selectedTask = useGNNStore((s) => s.selectedTask)
  const setTask = useGNNStore((s) => s.setTask)

  return (
    <label className="flex items-center gap-2 rounded-2xl border border-slate-700/50 bg-slate-900/65 px-3 py-2">
      <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Tác vụ</span>
      <select
        value={selectedTask}
        onChange={(e) => setTask(Number(e.target.value))}
        className="bg-transparent text-sm text-slate-100 outline-none"
      >
        {TASKS.map((task) => (
          <option key={task.id} value={task.id} className="bg-slate-950">
            {`Tác vụ ${task.id}: ${task.label}`}
          </option>
        ))}
      </select>
    </label>
  )
}
