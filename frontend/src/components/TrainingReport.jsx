import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'

const TASK_NAMES = {
  1: 'Phân loại nút',
  2: 'Phân loại đồ thị',
  3: 'Dự đoán liên kết',
  4: 'Phát hiện cộng đồng',
  5: 'Biểu diễn đồ thị',
  6: 'Sinh đồ thị',
}

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-slate-700/40 bg-slate-900/70 p-4">
      <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
      <div className="text-sm leading-6 text-slate-300">{children}</div>
    </section>
  )
}

function buildTaskSummary(task, snapshots) {
  const last = snapshots[snapshots.length - 1] || {}
  if (task === 1) {
    return `Mô hình học gán nhãn cho từng nút. Khi huấn luyện tiến triển, màu nút ổn định dần, cụm embedding tách ra rõ hơn, và độ chính xác kiểm định tăng lên.`
  }
  if (task === 2) {
    return `Mô hình gom thông tin từ nhiều nút để tạo một embedding cho cả đồ thị. Nếu các điểm đại diện cho đồ thị tách thành hai vùng rõ, phần readout đang hoạt động tốt.`
  }
  if (task === 3) {
    return `Mô hình chấm điểm từng cặp nút để dự đoán có nên tồn tại cạnh hay không. ROC, PR và khoảng cách latent giúp thấy rõ khả năng tách cạnh thật khỏi cạnh giả.`
  }
  if (task === 4) {
    return `Mô hình đang tìm các cộng đồng trong đồ thị. Khi modularity tăng và conductance giảm, biên cộng đồng đang rõ dần lên.`
  }
  if (task === 5) {
    return `Mô hình đang học một không gian ẩn sao cho các nút gần nhau trong cấu trúc gốc cũng gần nhau trong latent space. Chỉ số kNN preservation và reconstruction AUC là hai bằng chứng quan trọng nhất.`
  }
  return `Mô hình đang học một không gian ẩn để sinh ra đồ thị mới. Validity cho biết đồ thị sinh ra có hợp lệ không, uniqueness cho biết mẫu có đủ đa dạng không, novelty cho biết mức mới lạ so với dữ liệu nguồn. Ở epoch cuối, validity đạt ${(((last.validity_rate ?? 0) * 100)).toFixed(0)}%.`
}

export default function TrainingReport() {
  const reportOpen = useGNNStore((s) => s.reportOpen)
  const setReportOpen = useGNNStore((s) => s.setReportOpen)
  const selectedTask = useGNNStore((s) => s.selectedTask)
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const snapshots = usePlayerStore((s) => s.snapshots)
  const bestEpoch = usePlayerStore((s) => s.bestEpoch)

  if (!reportOpen) return null

  const last = snapshots[snapshots.length - 1] || {}
  const first = snapshots[0] || {}
  const valStart = first.val_acc ?? 0
  const valEnd = last.val_acc ?? 0
  const lossStart = first.train_loss ?? 0
  const lossEnd = last.train_loss ?? 0

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/78 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-[28px] border border-slate-700/40 bg-[#07101f] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800/70 px-6 py-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80 mb-1">Báo cáo huấn luyện</div>
            <h2 className="text-2xl font-semibold text-white">{TASK_NAMES[selectedTask]} với {selectedModel}</h2>
            <p className="text-sm text-slate-400 mt-1">Tài liệu này giải thích mô hình đã làm gì, từng vùng trực quan hóa biểu diễn điều gì, và bạn nên đọc kết quả theo cách nào.</p>
          </div>
          <button
            onClick={() => setReportOpen(false)}
            className="rounded-xl border border-slate-700/40 bg-slate-900/70 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/80"
          >
            Đóng
          </button>
        </div>

        <div className="max-h-[calc(88vh-96px)] overflow-y-auto px-6 py-5 space-y-4">
          <Section title="1. Mô hình vừa làm gì">
            <p>{buildTaskSummary(selectedTask, snapshots)}</p>
            <p className="mt-2">Epoch tốt nhất hiện được đánh dấu ở mốc {bestEpoch}. Độ chính xác kiểm định đi từ {(valStart * 100).toFixed(1)}% lên {(valEnd * 100).toFixed(1)}%, còn train loss đi từ {lossStart.toFixed(3)} xuống {lossEnd.toFixed(3)}.</p>
          </Section>

          <Section title="2. Cách đọc từng vùng trên màn hình">
            <p><strong>Vùng Cấu trúc:</strong> cho bạn thấy graph gốc hoặc mẫu graph đang được sinh ra. Đây là nơi nhìn mối quan hệ giữa node và cạnh.</p>
            <p><strong>Vùng Không gian embedding:</strong> cho bạn thấy model đã nén đối tượng xuống latent space như thế nào. Cụm càng tách rõ thì representation càng có ích cho bài toán.</p>
            <p><strong>Vùng Chỉ số:</strong> là bằng chứng định lượng để xác nhận hình ảnh trực quan có thật sự tốt hay chỉ nhìn đẹp.</p>
            <p><strong>Vùng Giải thích:</strong> là nơi đọc lý do cục bộ, ví dụ node nào được chú ý nhiều, graph nào có score tốt, hoặc latent point nào an toàn hơn.</p>
          </Section>

          <Section title="3. Cơ chế của model hiện tại">
            {selectedModel === 'GCN' && <p>GCN lấy thông tin từ hàng xóm rồi chuẩn hóa và cộng dồn theo kiểu trung bình có trọng số. Vì vậy hiệu ứng dễ thấy nhất là embedding mượt dần, các node cùng lớp kéo lại gần nhau, nhưng nếu quá nhiều lớp thì có nguy cơ over-smoothing.</p>}
            {selectedModel === 'GAT' && <p>GAT thêm attention trên cạnh. Nghĩa là mỗi hàng xóm không đóng góp ngang nhau. Cạnh nào sáng hoặc nổi bật hơn là nơi model đang đặt nhiều trọng số hơn cho quyết định hiện tại.</p>}
            {selectedModel === 'SAGE' && <p>GraphSAGE lấy mẫu và tổng hợp thông tin lân cận, phù hợp cho suy luận inductive. Điểm mạnh của nó là có thể xử lý node hoặc graph mới mà không cần thấy toàn bộ cấu trúc ngay từ đầu.</p>}
          </Section>

          <Section title="4. Vì sao biểu đồ lại đổi trong lúc train">
            <p>Mỗi epoch backend gửi một snapshot mới gồm dự đoán, embedding và metric. Frontend nội suy hoặc thay frame để mô tả tiến trình học theo thời gian. Nói ngắn gọn: biểu đồ đổi vì latent vector, xác suất dự đoán và chỉ số tối ưu hóa đang đổi thật.</p>
            <p className="mt-2">Nếu một đường hoặc panel đứng yên, điều đó thường có nghĩa là snapshot mới chưa thay đổi nhiều hoặc model đang bước vào giai đoạn hội tụ.</p>
          </Section>

          <Section title="5. Kết luận nhanh">
            <p>Hãy xem kết quả tốt khi vừa có xu hướng trực quan đúng, vừa có chỉ số phù hợp. Ví dụ: cụm embedding rõ hơn phải đi kèm val acc, AUC hoặc validity tăng lên. Nếu chỉ số không cải thiện nhưng hình nhìn đẹp, ta chưa nên tin model.</p>
          </Section>
        </div>
      </div>
    </div>
  )
}
