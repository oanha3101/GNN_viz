import useGNNStore from '../store/useGNNStore'

const MODEL_GUIDES = {
  GCN: {
    title: 'GCN',
    summary: 'GCN trộn thông tin từ hàng xóm theo kiểu trung bình chuẩn hóa. Hãy xem nó như quá trình làm mịn vector đặc trưng qua từng lớp.',
    signal: 'Nếu các cụm tách dần ra thì GCN đang học được cấu trúc. Nếu mọi node bắt đầu giống nhau quá mức thì đó là over-smoothing.',
  },
  GAT: {
    title: 'GAT',
    summary: 'GAT không xem mọi hàng xóm như nhau. Mỗi cạnh có attention weight để nói node nào đang ảnh hưởng mạnh hơn.',
    signal: 'Cạnh sáng hơn nghĩa là attention cao hơn. Khi click một node, các cạnh nổi bật cho biết model đang lắng nghe ai để ra quyết định.',
  },
  SAGE: {
    title: 'GraphSAGE',
    summary: 'GraphSAGE lấy mẫu hàng xóm rồi tổng hợp đặc trưng để hỗ trợ inductive learning, tức là suy luận cho node mới chưa thấy lúc train.',
    signal: 'Nếu neighborhood local tạo được embedding ổn định thì GraphSAGE đang học tốt. Nó phù hợp khi đồ thị thay đổi liên tục.',
  },
}

const TASK_GUIDES = {
  1: {
    title: 'Node Classification',
    topology: 'Mỗi node là một thực thể cần dự đoán nhãn. Màu node là lớp dự đoán hoặc lỗi dự đoán tùy mode.',
    embedding: 'Mỗi chấm là embedding của một node. Cụm càng tách rõ thì representation càng tốt.',
    metrics: 'Loss giảm và val acc tăng nghĩa là node embeddings đang giúp phân loại tốt hơn.',
    inspector: 'Panel phải cho biết node nào đúng hay sai, độ tự tin ra sao, và với GAT thì node đó đang chú ý tới hàng xóm nào.',
  },
  2: {
    title: 'Graph Classification',
    topology: 'Mỗi ô là một graph mẫu. Readout của GNN phải gom thông tin node-level thành một embedding graph-level.',
    embedding: 'Mỗi chấm là một graph. Nếu Dense và Sparse tách nhau, readout đang gom đúng tín hiệu cấu trúc.',
    metrics: 'Metric cho biết model phân biệt được loại đồ thị tốt tới đâu.',
    inspector: 'Readout heatmap sáng ở node nào thì node đó đóng góp mạnh hơn vào dự đoán cuối cùng của graph.',
  },
  3: {
    title: 'Link Prediction',
    topology: 'Node vẫn là thực thể, nhưng mục tiêu là dự đoán cặp node nào nên có cạnh.',
    embedding: 'Các cặp dương tính nên tiến gần nhau trong latent space. Cặp âm tính nên bị đẩy xa ra.',
    metrics: 'ROC và PR cho biết model xếp hạng cạnh thật tốt tới đâu, không chỉ dựa vào một ngưỡng duy nhất.',
    inspector: 'AUC cao nghĩa là cạnh thật thường được chấm điểm cao hơn cạnh giả. Collapse warning nghĩa là embedding đang mất cấu trúc.',
  },
  4: {
    title: 'Community Detection',
    topology: 'Màu node biểu diễn community model đang gán. Cầu nối giữa cộng đồng cho thấy nơi biên cộng đồng còn mờ.',
    embedding: 'Phân tách cụm và dendrogram giúp xem community hình thành dần như thế nào.',
    metrics: 'Modularity cao và conductance thấp thường là dấu hiệu cộng đồng đang rõ hơn.',
    inspector: 'Bridge nodes là các node nối nhiều cộng đồng. Chúng thường là nơi model dễ nhầm nhất.',
  },
  5: {
    title: 'Graph Embedding',
    topology: 'Đồ thị gốc giữ nguyên, nhưng cạnh đổi màu theo khoảng cách embedding. Cạnh xanh hơn là hai node đang gần nhau trong latent space.',
    embedding: 'PCA và t-SNE cho hai cách chiếu embedding xuống 2D. Trail cho thấy node di chuyển ra sao qua từng epoch.',
    metrics: 'kNN preservation đo embedding có giữ neighborhood gốc hay không. Reconstruction AUC đo latent space có tái tạo quan hệ cạnh tốt không.',
    inspector: 'Nếu cấu trúc gốc và cấu trúc latent cùng đẹp hơn theo thời gian thì embedding đang học được topology thật, không chỉ nén dữ liệu.',
  },
  6: {
    title: 'Graph Generation',
    topology: 'Mỗi thẻ là một graph được sinh ra. Validity, density, degree và isolated ratio nói graph sinh ra có hợp lý không.',
    embedding: 'Latent space cho biết những vector ẩn nào sinh ra graph ổn hơn. Điểm xanh là vùng latent an toàn hơn, điểm đỏ là vùng rủi ro hơn.',
    metrics: 'Validity đo graph hợp lệ, uniqueness đo các mẫu có khác nhau không, novelty đo mức mới lạ so với dữ liệu gốc.',
    inspector: 'Khi kéo interpolation giữa hai latent points, bạn đang xem không gian ẩn thay đổi liên tục hay gãy khúc. Graph generator tốt sẽ có latent space mượt.',
  },
}

function GuideRow({ label, text, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-700/40 bg-slate-900/60',
    blue: 'border-blue-500/20 bg-blue-500/8',
    emerald: 'border-emerald-500/20 bg-emerald-500/8',
  }[tone]

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500 mb-1">{label}</div>
      <p className="text-[11px] leading-5 text-slate-300">{text}</p>
    </div>
  )
}

export default function VisualizationGuide() {
  const selectedTask = useGNNStore((s) => s.selectedTask)
  const selectedModel = useGNNStore((s) => s.selectedModel)

  const taskGuide = TASK_GUIDES[selectedTask] || TASK_GUIDES[1]
  const modelGuide = MODEL_GUIDES[selectedModel] || MODEL_GUIDES.GCN

  return (
    <div className="guide-card p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] uppercase tracking-[0.28em] text-cyan-300/80 mb-1">Cách đọc màn hình</div>
          <h3 className="text-sm font-semibold text-white">{taskGuide.title}</h3>
        </div>
        <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[9px] font-semibold text-cyan-200">
          {modelGuide.title}
        </div>
      </div>

      <GuideRow label="Cơ chế mô hình" text={modelGuide.summary} tone="blue" />
      <GuideRow label="Điều nên quan sát" text={modelGuide.signal} tone="emerald" />
      <GuideRow label="Nút và cạnh" text={taskGuide.topology} />
      <GuideRow label="Không gian embedding" text={taskGuide.embedding} />
      <GuideRow label="Chỉ số" text={taskGuide.metrics} />
      <GuideRow label="Bảng giải thích" text={taskGuide.inspector} />
    </div>
  )
}
