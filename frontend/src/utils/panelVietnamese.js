const COMMON_REPLACEMENTS = {
  Epoch: 'Epoch',
  Model: 'Mô hình',
  'Best AUC': 'AUC tốt nhất',
  Delta: 'Độ đổi',
  'Attn focus': 'Độ tập trung attention',
  Stability: 'Độ ổn định',
  'Smooth sep': 'Tách mượt',
  Positive: 'Cạnh dương',
  Negative: 'Cạnh âm',
  'Ground Truth': 'Nhãn thật',
  Predicted: 'Dự đoán',
  Correct: 'Đúng',
  Incorrect: 'Sai',
  Confidence: 'Độ tin cậy',
  Degree: 'Bậc',
  Role: 'Vai trò',
  Bridge: 'Cầu nối',
  Match: 'Khớp',
  Mismatch: 'Lệch',
  'Predicted Community': 'Cộng đồng dự đoán',
  'Bridge Strength': 'Độ mạnh cầu nối',
  'Cross-community Neighbors': 'Láng giềng khác cụm',
  'more': 'mục nữa',
}

export const TASK1_PANEL_VI = {
  ...COMMON_REPLACEMENTS,
  Overview: 'Tổng quan',
  Confusion: 'Nhầm lẫn',
  Homophily: 'Homophily',
  Insights: 'Insight',
  'Task 1 Lens': 'Lăng kính Task 1',
  'Task 1 metrics will appear here': 'Chỉ số Task 1 sẽ hiện ở đây',
  'Start or replay a training run to inspect node classification quality, confusion, and latent separation.':
    'Bắt đầu hoặc phát lại một lượt huấn luyện để kiểm tra chất lượng phân loại node, ma trận nhầm lẫn và độ tách latent.',
  'Node classification diagnostics across accuracy, confusion, neighborhood fit, and embedding structure.':
    'Chẩn đoán phân loại node qua độ chính xác, nhầm lẫn, độ khớp lân cận và cấu trúc embedding.',
  'snapshot frames': 'frame snapshot',
  'Polished for readability only, without adding heavier charts or runtime effects.':
    'Tối ưu để dễ đọc, không thêm biểu đồ nặng hoặc hiệu ứng runtime.',
  'Active view': 'Khung đang xem',
  'Val Acc': 'Độ chính xác validation',
  'Train Loss': 'Loss huấn luyện',
  'Loss and validation accuracy': 'Loss và độ chính xác validation',
  'Read the slope first: rising accuracy with falling loss means the run is still healthy.':
    'Đọc độ dốc trước: accuracy tăng và loss giảm nghĩa là lượt chạy vẫn khỏe.',
  'Val Loss': 'Loss validation',
  'Val Acc (%)': 'Độ chính xác validation (%)',
  'Reliability guardrail': 'Rào chắn độ tin cậy',
  'Interpret carefully before trusting a single run': 'Diễn giải cẩn thận trước khi tin một lượt chạy đơn.',
  'Metrics are usable, but context matters': 'Chỉ số có thể dùng được, nhưng cần đọc cùng bối cảnh.',
  'Metrics look reasonably stable for this snapshot': 'Chỉ số tương đối ổn định ở snapshot này.',
  'Train-val gap': 'Chênh train-val',
  'Train split': 'Tập train',
  'Val split': 'Tập validation',
  'Test split': 'Tập test',
  'Holdout nodes': 'Node giữ lại',
  Total: 'Tổng',
  Train: 'Train',
  Val: 'Validation',
  Test: 'Test',
  Class: 'Lớp',
  'Model Lens': 'Lăng kính mô hình',
  'Model-specific diagnostics': 'Chẩn đoán riêng theo mô hình',
  'showing what makes': 'cho thấy điểm khác biệt của',
  'unique at epoch': 'ở epoch',
  Wrong: 'Sai',
  'Class distribution | GT vs predicted': 'Phân bố lớp | nhãn thật so với dự đoán',
  'Model Compare': 'So sánh mô hình',
  'Task 1 | GCN vs GAT vs GraphSAGE': 'Task 1 | GCN so với GAT so với GraphSAGE',
  'Saved-run comparison needs at least two completed Task 1 runs on this dataset. Until then, this local baseline uses deterministic mock curves with the same node/epoch scale.':
    'So sánh run đã lưu cần ít nhất hai lượt Task 1 hoàn tất trên dataset này. Tạm thời baseline cục bộ dùng mock deterministic cùng thang node/epoch.',
  Loss: 'Loss',
}

export const TASK4_PANEL_VI = {
  ...COMMON_REPLACEMENTS,
  'Val recon AUC': 'AUC tái tạo validation',
  'Structural holdout signal; does not use community labels.':
    'Tín hiệu holdout cấu trúc; không dùng nhãn cộng đồng.',
  Balance: 'Cân bằng',
  'Higher means less community collapse.': 'Càng cao càng ít nguy cơ sụp cụm.',
  'Gen gap': 'Chênh tổng quát',
  'Train reconstruction loss minus validation reconstruction loss.':
    'Loss tái tạo train trừ loss tái tạo validation.',
  'Baseline sim': 'Độ giống baseline',
  'Structure agreement measured at the untrained baseline.':
    'Mức khớp cấu trúc đo ở baseline chưa train.',
  'Viz confidence': 'Độ tin cậy trực quan',
  'How reliable this visual partition is as an explanation.':
    'Mức đáng tin của partition trực quan khi dùng để giải thích.',
  'Collapse/overfit risk: check empty communities, largest-community ratio, balance, and validation reconstruction before trusting the partition.':
    'Nguy cơ sụp cụm/overfit: hãy kiểm tra cụm rỗng, tỷ lệ cụm lớn nhất, cân bằng và tái tạo validation trước khi tin partition.',
  'Baseline chua train da tach kha tot: graph nay co community structure ro tu topology/features, khong phai model hoc truoc ground truth.':
    'Baseline chưa train đã tách khá tốt: graph này có cấu trúc cộng đồng rõ từ topology/features, không phải model học trước ground truth.',
  'Baseline chua train: epoch 0 dung embedding truoc optimizer step dau tien de ban thay diem xuat phat cua real training.':
    'Baseline chưa train: epoch 0 dùng embedding trước bước optimizer đầu tiên để thấy điểm xuất phát của real training.',
  'Raw loss around 1.x can be normal for Task 4 because it combines positive-edge, negative-edge, and cohesion terms. Judge community quality with modularity, conductance, NMI, stability, balance, and validation reconstruction.':
    'Raw loss khoảng 1.x có thể bình thường ở Task 4 vì gồm positive-edge, negative-edge và cohesion. Hãy đánh giá cộng đồng bằng modularity, conductance, NMI, ổn định, cân bằng và tái tạo validation.',
  Phase: 'Giai đoạn',
  Normalized: 'Chuẩn hoá',
  'Pos edge': 'Cạnh dương',
  'Neg edge': 'Cạnh âm',
  Cohesion: 'Cohesion',
  'Composite loss breakdown': 'Phân rã composite loss',
  'Raw loss is a composite unsupervised objective, so values around 1.x can be normal. Use modularity, conductance, NMI, stability, balance, and validation reconstruction to judge community quality.':
    'Raw loss là mục tiêu unsupervised tổng hợp, nên giá trị khoảng 1.x có thể bình thường. Hãy dùng modularity, conductance, NMI, ổn định, cân bằng và tái tạo validation để đánh giá chất lượng cộng đồng.',
  'Baseline chua train': 'Baseline chưa train',
  'Viz conf': 'Độ tin cậy trực quan',
  'Khop GT sau align': 'Khớp GT sau align',
  'Lech GT sau align': 'Lệch GT sau align',
}

export function localizeElementText(root, lang, replacements = {}) {
  if (!root || lang !== 'vi') return
  const dict = { ...COMMON_REPLACEMENTS, ...replacements }
  const translate = (text) => {
    if (!text) return text
    let out = text
    const trimmed = out.trim()
    if (dict[trimmed]) {
      return out.replace(trimmed, dict[trimmed])
    }
    for (const [source, target] of Object.entries(dict).sort((a, b) => b[0].length - a[0].length)) {
      const isWord = /^[a-zA-Z0-9_]+$/.test(source)
      if (isWord) {
        const regex = new RegExp('\\b' + source + '\\b', 'g')
        out = out.replace(regex, target)
      } else {
        out = out.replaceAll(source, target)
      }
    }
    return out
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  for (const node of nodes) {
    node.nodeValue = translate(node.nodeValue)
  }
  root.querySelectorAll('[title],[aria-label]').forEach((el) => {
    for (const attr of ['title', 'aria-label']) {
      const value = el.getAttribute(attr)
      if (value) el.setAttribute(attr, translate(value))
    }
  })
}
