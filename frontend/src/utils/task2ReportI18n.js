export function translateTask2ReportText(text, lang) {
  if (!text || lang !== 'vi') return text

  const exact = {
    'Class collapse': 'Sụp đổ lớp',
    Calibration: 'Hiệu chuẩn',
    'Shortcut bias': 'Thiên lệch shortcut',
    'No weak-class signal yet': 'Chưa có tín hiệu lớp yếu',
    All: 'Tất cả',
    Misclassified: 'Phân loại sai',
    'Weak-class misses': 'Các ca trượt của lớp yếu',
    'Low margin': 'Margin thấp',
    'Diffuse readout': 'Readout loãng',
    'Structural outlier': 'Ngoại lệ cấu trúc',
    'Entire graph collection.': 'Toàn bộ bộ sưu tập đồ thị.',
    'Graphs the model currently gets wrong.': 'Các đồ thị mà mô hình hiện đang dự đoán sai.',
    'Graphs sitting near the decision boundary.': 'Các đồ thị đang nằm sát ranh giới quyết định.',
    'Graphs whose node attention is spread across many weak signals.': 'Các đồ thị có attention ở mức nút bị dàn trải trên nhiều tín hiệu yếu.',
    'Graphs whose density or clustering departs from the collection norm.': 'Các đồ thị có mật độ hoặc mức phân cụm lệch khỏi chuẩn chung của bộ sưu tập.',
    'The slice is mostly stable, but boundary examples still deserve attention.': 'Lát cắt này nhìn chung khá ổn định, nhưng các ca vùng biên vẫn cần được chú ý.',
    'Structural outliers are the strongest signal in this slice.': 'Structural outliers là tín hiệu mạnh nhất trong lát cắt này.',
    'Most graphs are stable wins, so the remaining errors are likely boundary cases.': 'Phần lớn đồ thị là các ca đúng ổn định, nên lỗi còn lại nhiều khả năng là boundary cases.',
    'Confidence and Macro F1 should be read together before trusting the benchmark story.': 'Cần đọc confidence cùng với Macro F1 trước khi tin vào câu chuyện benchmark.',
    'Overconfident misses suggest the classifier is trusting the wrong motif shape.': 'Các ca sai nhưng quá tự tin cho thấy bộ phân loại đang tin vào motif shape không đúng.',
    'Thin margins mean the decision boundary is still fragile.': 'Margin mỏng cho thấy ranh giới quyết định vẫn còn mong manh.',
    'Use the Failure tab to isolate the hardest graphs.': 'Hãy mở tab Failures để tách ra các đồ thị khó nhất.',
    'Use the Structure tab to inspect structural outliers.': 'Hãy mở tab Structure để soi các structural outliers.',
    'Use the Readout tab to inspect overconfident misses.': 'Hãy mở tab Readout để kiểm tra các ca sai nhưng quá tự tin.',
    'Use the Failures tab to inspect boundary cases.': 'Hãy mở tab Failures để kiểm tra các boundary cases.',
    'Predictions are spread across classes without an obvious collapse pattern.': 'Dự đoán đang được phân bố qua nhiều lớp, chưa thấy dấu hiệu sụp đổ rõ rệt vào một lớp duy nhất.',
    'Per-class recall and prediction share are staying within a usable range.': 'Recall theo lớp và tỷ lệ phân bố dự đoán vẫn đang nằm trong vùng có thể sử dụng để đọc nghiên cứu.',
    'Use Failures to inspect the remaining boundary graphs.': 'Hãy dùng tab Failures để soi các đồ thị vùng biên còn lại.',
    'Confidence is tracking correctness closely enough for visual interpretation.': 'Độ tin cậy hiện vẫn bám tương đối sát độ đúng, đủ dùng cho việc diễn giải trực quan.',
    'Use Readout to validate the most confident mistakes before exporting conclusions.': 'Hãy dùng tab Readout để kiểm tra các lỗi tự tin nhất trước khi chốt kết luận.',
    'High-confidence predictions are not lining up cleanly with correctness on this slice.': 'Các dự đoán có độ tự tin cao không còn khớp sạch với độ đúng trong lát cắt này.',
    'Treat confidence as a ranking cue, not proof. Inspect the Failure and Readout tabs together.': 'Hãy xem confidence như tín hiệu xếp hạng, không phải bằng chứng. Nên đọc đồng thời Failures và Readout.',
    'Confidence is usable, but it still runs ahead of true reliability.': 'Confidence có thể dùng được, nhưng vẫn đang đi trước độ tin cậy thực sự.',
    'Compare confidence with margins and hard-case slices before trusting graph-level certainty.': 'Hãy đối chiếu confidence với margin và các hard-case slice trước khi tin vào độ chắc chắn ở mức đồ thị.',
    'No strong structural shortcut is dominating confidence on this slice.': 'Chưa thấy structural shortcut mạnh nào chi phối confidence trong lát cắt này.',
    'Use Structure for motif reading, not just for shortcut checking.': 'Hãy dùng tab Structure để đọc motif, không chỉ để kiểm tra shortcut.',
    'Confidence is strongly correlated with density, so the model may be using a structural shortcut.': 'Confidence đang tương quan mạnh với mật độ, nên mô hình có thể đang dùng structural shortcut.',
    'Confidence is strongly correlated with graph size, so the model may be using a structural shortcut.': 'Confidence đang tương quan mạnh với kích thước đồ thị, nên mô hình có thể đang dùng structural shortcut.',
    'Use Structure to inspect whether hard cases cluster by topology before trusting motif-level language.': 'Hãy dùng tab Structure để kiểm tra xem hard cases có đang tụ theo topology hay không trước khi kết luận ở mức motif.',
    'There is a mild structural shortcut signal in the confidence pattern.': 'Đang có tín hiệu shortcut cấu trúc nhẹ trong pattern của confidence.',
    'Cross-check topology slices with misclassified graphs to confirm the model is reading motifs, not just size cues.': 'Hãy đối chiếu topology slices với các đồ thị bị phân loại sai để xác nhận mô hình đang đọc motif, không chỉ bám theo tín hiệu kích thước.',
    'Treat this collection more like a motif probe than a benchmark. Use confusion, margins, and structural slices together.': 'Hãy xem collection này như một phép dò motif hơn là benchmark thuần. Nên đọc confusion, margin và structural slices cùng nhau.',
    'Use accuracy for trend, but confirm with Macro F1, hard cases, and readout concentration before concluding the model is robust.': 'Hãy dùng accuracy để xem xu hướng, nhưng cần xác nhận thêm bằng Macro F1, hard cases và mức độ tập trung readout trước khi kết luận mô hình thật sự robust.',
    'This dataset has relatively few graphs, so single mistakes can move metrics more than expected.': 'Dataset này có tương đối ít đồ thị, nên chỉ một vài lỗi đơn lẻ cũng có thể làm metric dao động mạnh hơn dự kiến.',
    'At least one class has fewer than 5 graphs. Read confusion and Macro F1 before trusting accuracy.': 'Có ít nhất một lớp có dưới 5 đồ thị. Hãy đọc confusion và Macro F1 trước khi tin vào accuracy.',
    'Class balance is skewed. Accuracy may look healthy even when minority graph types are weak.': 'Phân bố lớp đang lệch. Accuracy có thể trông ổn dù các kiểu đồ thị thiểu số vẫn còn yếu.',
    'One class dominates the collection, so compare confidence and per-class recall together.': 'Một lớp đang chiếm ưu thế trong collection, nên cần đọc confidence cùng với recall theo từng lớp.',
    'Accuracy is outpacing Macro F1. The model may be winning on common graphs while missing rarer motifs.': 'Accuracy đang vượt xa Macro F1. Mô hình có thể đang thắng trên các đồ thị phổ biến nhưng bỏ lỡ các motif hiếm hơn.',
    'Wrong graphs still carry high confidence. This looks like overconfident graph-level reasoning.': 'Các đồ thị sai vẫn mang độ tự tin cao. Đây là dấu hiệu của graph-level reasoning quá tự tin.',
    'Confidence calibration is weak. High-probability predictions are not aligning well with actual correctness.': 'Calibration của confidence còn yếu. Các dự đoán xác suất cao chưa khớp tốt với độ đúng thực tế.',
    'A noticeable share of graphs are wrong with high confidence. Treat explanations on those cases as hypotheses, not proof.': 'Có một tỷ lệ đáng kể đồ thị sai nhưng lại rất tự tin. Hãy xem giải thích của các ca này như giả thuyết, không phải bằng chứng.',
    'Many graphs have thin top-1 vs top-2 margins. The class boundary is still fragile.': 'Nhiều đồ thị có khoảng cách top-1 và top-2 rất mỏng. Ranh giới giữa các lớp vẫn còn mong manh.',
    'Readout attention is diffuse on average. Inspect which graphs rely on many weak signals instead of one motif.': 'Readout attention nhìn chung đang loãng. Hãy kiểm tra đồ thị nào đang dựa vào nhiều tín hiệu yếu thay vì một motif rõ ràng.',
    'Confidence is correlating with graph size or density. Inspect whether the model is leaning on structural shortcuts.': 'Confidence đang tương quan với kích thước hoặc mật độ đồ thị. Hãy kiểm tra xem mô hình có đang dựa vào structural shortcuts hay không.',
    'diffuse global distribution with local top contributors': 'phân bố toàn cục loãng nhưng vẫn có vài điểm đóng góp cục bộ nổi bật',
    'diffuse global readout distribution': 'phân bố readout toàn cục loãng',
    'concentrated local contributors': 'các điểm đóng góp cục bộ tập trung',
    'low-concentration local contributors': 'các điểm đóng góp cục bộ có mức tập trung thấp',
    'mixed readout distribution': 'phân bố readout pha trộn',
    'sparse graph, weak local motif': 'đồ thị thưa, motif cục bộ yếu',
    'dense cohesive motif': 'motif dày và kết dính',
    'clustered motif with focused readout': 'motif phân cụm với readout tập trung',
    'hub-heavy but diffuse': 'nhiều hub nhưng loãng',
    'concentrated readout on compact motif': 'readout tập trung trên motif cô đọng',
    'balanced structural cue': 'tín hiệu cấu trúc cân bằng',
    'mixed structural cue': 'tín hiệu cấu trúc pha trộn',
    sparse: 'thưa',
    medium: 'trung bình',
    dense: 'dày',
    concentrated: 'tập trung',
    diffuse: 'loãng',
    mixed: 'pha trộn',
    low: 'thấp',
    high: 'cao',
  }

  if (exact[text]) return exact[text]

  const moreExact = {
    Overview: 'Tổng quan',
    Failures: 'Lỗi',
    Structure: 'Cấu trúc',
    Readout: 'Readout',
    Graphs: 'Đồ thị',
    Classes: 'Lớp',
    'Avg Nodes': 'Số nút TB',
    'Avg Edges': 'Số cạnh TB',
    'Median Margin': 'Margin trung vị',
    'Size Bias': 'Thiên lệch kích thước',
    'Current focus': 'Tập trung hiện tại',
    'Collection balance': 'Cân bằng collection',
    'Training trend': 'Xu hướng huấn luyện',
    'Per-class metrics': 'Chỉ số theo lớp',
    'Weak-class watch': 'Theo dõi lớp yếu',
    'Open slice': 'Mở lát cắt',
    Precision: 'Precision',
    Recall: 'Recall',
    'Mean conf': 'Confidence TB',
    'Conf vs Density': 'Conf theo mật độ',
    'Conf vs Size': 'Conf theo kích thước',
    'Conf vs Edges': 'Conf theo số cạnh',
    'Research signals': 'Tín hiệu nghiên cứu',
    'Trust profile': 'Hồ sơ độ tin cậy',
    'Best epoch suggestion': 'Gợi ý epoch tốt nhất',
    'Focus routing': 'Điều hướng lát cắt',
    'Collection story': 'Câu chuyện collection',
    'Next lens': 'Lăng kính tiếp theo',
    'Main insight': 'Insight chính',
    'Main risk': 'Rủi ro chính',
    'Support': 'Support',
    'Node count': 'Số nút',
    'Edge count': 'Số cạnh',
    'Wrong share': 'Tỷ lệ sai',
    'Boundary pressure': 'Áp lực vùng biên',
    'Failure slice': 'Lát cắt lỗi',
    'Active slice': 'Lát cắt đang hoạt động',
    'Slice note': 'Ghi chú lát cắt',
    'Density profile': 'Hồ sơ mật độ',
    'Confidence profile': 'Hồ sơ confidence',
    'Entropy profile': 'Hồ sơ entropy',
    'Selected graph': 'Đồ thị đang chọn',
    'No graph selected': 'Chưa chọn đồ thị nào',
    'Hard-case queue': 'Hàng đợi ca khó',
    'Readout lens': 'Lăng kính readout',
    'Readout summary': 'Tóm tắt readout',
    'Structure cue': 'Tín hiệu cấu trúc',
    'Failure tag': 'Thẻ lỗi',
    'GT': 'Nhãn thật',
    'Pred': 'Dự đoán',
    'Margin': 'Margin',
    'Density': 'Mật độ',
    'Clustering': 'Phân cụm',
    'Cluster Coef': 'Hệ số cụm',
    'AvgDeg': 'Bậc TB',
    'Color mode': 'Chế độ màu',
    'Task 2 metrics will appear here': 'Chỉ số Task 2 sẽ hiện ở đây',
    'overconfident miss': 'sai nhưng quá tự tin',
    'boundary case': 'ca vùng biên',
    'diffuse readout': 'readout loãng',
    'structural outlier': 'ngoại lệ cấu trúc',
    'stable win': 'ca ổn định',
    graphs: 'đồ thị',
    'class profiles': 'hồ sơ lớp',
    'Showing the full collection in one view': 'Đang hiển thị toàn bộ collection trong một khung nhìn',
    'Start or replay a graph classification run to inspect collection-level failures, structure, and readout quality.': 'Hãy bắt đầu hoặc phát lại một lượt chạy phân loại đồ thị để kiểm tra lỗi ở mức collection, cấu trúc và chất lượng readout.',
    'Use this as the health trace. Then confirm the story with the failure slice and structure slice.': 'Hãy dùng phần này như đường sức khỏe của mô hình. Sau đó xác nhận lại câu chuyện bằng failure slice và structure slice.',
    'Class support tells you whether Task 2 should be read like a benchmark or more like a motif probe.': 'Phân bố support theo lớp cho biết Task 2 nên được đọc như benchmark hay như một phép dò motif.',
    'Read recall first for the weak class, then confirm precision, F1, and mean confidence.': 'Hãy đọc recall của lớp yếu trước, rồi mới đối chiếu thêm precision, F1 và mean confidence.',
    'Positive or negative correlation here suggests the model may be leaning on graph size or density.': 'Tương quan dương hoặc âm ở đây là dấu hiệu cho thấy mô hình có thể đang nghiêng theo kích thước hoặc mật độ đồ thị.',
    'These cards turn the current run into three questions: is the model collapsing toward one class, are its confidences trustworthy, and is it using structural shortcuts.': 'Các thẻ này biến lượt chạy hiện tại thành ba câu hỏi: mô hình có đang sụp về một lớp, confidence có đáng tin, và có đang dùng structural shortcut hay không.',
    'A compact research-grade read: calibration quality, high-confidence mistakes, shortcut pressure, and whether readout is concentrated enough to support motif-level claims.': 'Một nhịp đọc ngắn kiểu research-grade: chất lượng calibration, các ca sai nhưng tự tin, áp lực shortcut, và mức readout có đủ tập trung để nâng đỡ kết luận ở mức motif hay không.',
    'No graphs in this slice': 'Không có đồ thị nào trong lát cắt này',
    'Batch heatmap': 'Heatmap theo lô',
    'Hardest cases': 'Các ca khó nhất',
    'Structure explanation': 'Giải thích cấu trúc',
    'No strong outliers here': 'Không có ngoại lệ mạnh ở đây',
    'No graph selected': 'Chưa chọn đồ thị nào',
    'Featured graph': 'Đồ thị nổi bật',
    'Ground truth': 'Nhãn thật',
    Prediction: 'Dự đoán',
    'Nodes / edges': 'Nút / cạnh',
    'Readout interpretation': 'Diễn giải readout',
    'Structural profile': 'Hồ sơ cấu trúc',
    'Motif signature:': 'Chữ ký motif:',
    'Readout concentration': 'Mức tập trung readout',
    'No node contribution data yet.': 'Chưa có dữ liệu mức đóng góp của từng nút.',
    'Diagnostics unavailable': 'Chưa có chẩn đoán',
    'Confidence distribution': 'Phân bố confidence',
    Correct: 'Đúng',
    Wrong: 'Sai',
    'Entropy × density': 'Entropy × mật độ',
    'Task 2 readout monitor': 'Bộ theo dõi readout Task 2',
    Report: 'Báo cáo',
    Pinned: 'Đã ghim',
    Hover: 'Rê chuột',
    'Narrative profile': 'Hồ sơ narrative',
    'Top contributors': 'Các nút đóng góp chính',
    'Awaiting Latent...': 'Đang chờ không gian ẩn...',
    Color: 'Màu',
    Predicted: 'Dự đoán',
    Silhouette: 'Silhouette',
    Legend: 'Chú giải',
    'Graph collection': 'Bộ sưu tập đồ thị',
    'class profiles': 'hồ sơ lớp',
    Prev: 'Trước',
    Page: 'Trang',
    Next: 'Tiếp',
    Priority: 'Ưu tiên',
    Confidence: 'Độ tin cậy',
    Size: 'Kích thước',
    'GT class': 'Lớp thật',
    Pending: 'Đang chờ',
    Danger: 'Nguy cơ cao',
    Uncertain: 'Chưa chắc',
    Status: 'Trạng thái',
    'Back to gallery': 'Quay lại gallery',
    'No graph data': 'Chưa có dữ liệu đồ thị',
    Focus: 'Tập trung',
    'Research workspace': 'Không gian nghiên cứu',
    Dashboard: 'Bảng điều khiển',
    Projects: 'Dự án',
    Datasets: 'Tập dữ liệu',
    Experiments: 'Thí nghiệm',
    Lab: 'Phòng Lab',
    Admin: 'Quản trị',
    'Log out': 'Đăng xuất',
    'Latent space': 'Không gian ẩn',
    'Latent space · predicted': 'Không gian ẩn · dự đoán',
    'Latent space · correctness': 'Không gian ẩn · độ đúng',
    'Latent space · confidence': 'Không gian ẩn · độ tin cậy',
    'Latent space · entropy': 'Không gian ẩn · entropy',
    'Structure and inspector': 'Cấu trúc và inspector',
    'Gallery · priority': 'Gallery · ưu tiên',
    'Gallery · confidence': 'Gallery · độ tin cậy',
    'Gallery · entropy': 'Gallery · entropy',
    'Gallery · size': 'Gallery · kích thước',
    'GRAPH COLLECTION': 'Bộ sưu tập đồ thị',
    'Hover a Task 2 embedding point': 'Rê chuột vào một điểm embedding Task 2',
    'to inspect graph-level readout': 'để kiểm tra readout cấp đồ thị',
    correct: 'đúng',
    wrong: 'sai',
    'GT Class': 'Lớp thật',
    'Pred Class': 'Lớp dự đoán',
    'Status Correct': 'Trạng thái đúng',
    'Status Wrong': 'Trạng thái sai',
    'Status Danger': 'Trạng thái nguy cơ cao',
    'Status Uncertain': 'Trạng thái chưa chắc',
  }
  if (moreExact[text]) return moreExact[text]

  const overconfidentMatch = text.match(/^The model is making (\d+) overconfident mistake(s)? on this slice\.$/)
  if (overconfidentMatch) {
    return `Mô hình đang tạo ra ${overconfidentMatch[1]} lỗi quá tự tin trong lát cắt này.`
  }

  const diffuseMatch = text.match(/^Diffuse readout dominates (\d+) graph(s)? in this slice\.$/)
  if (diffuseMatch) {
    return `Readout loãng đang chiếm ưu thế trên ${diffuseMatch[1]} đồ thị trong lát cắt này.`
  }

  const weakClassMatch = text.match(/^(.+?) is still the weak class with recall at ([\d.]+)%\.$/)
  if (weakClassMatch) {
    return `${weakClassMatch[1]} vẫn là lớp yếu với recall ở mức ${weakClassMatch[2]}%.`
  }

  const collapseTowardMatch = text.match(/^Predictions are collapsing toward (.+?) while (.+?) recall is only ([\d.]+)%\.$/)
  if (collapseTowardMatch) {
    return `Dự đoán đang sụp dồn về ${collapseTowardMatch[1]}, trong khi recall của ${collapseTowardMatch[2]} chỉ còn ${collapseTowardMatch[3]}%.`
  }

  const absorbedMatch = text.match(/^(\d+) graph(s)? from the weak class are being absorbed into the dominant prediction stream\.$/)
  if (absorbedMatch) {
    return `${absorbedMatch[1]} đồ thị của lớp yếu đang bị hút vào luồng dự đoán chiếm ưu thế.`
  }

  const predShareMatch = text.match(/^Prediction share is leaning (?:toward )?(.+?) \(([\d.]+)%\), and balanced accuracy is ([\d.]+)%\.$/)
  if (predShareMatch) {
    return `Tỷ lệ dự đoán đang nghiêng về ${predShareMatch[1]} (${predShareMatch[2]}%), và balanced accuracy là ${predShareMatch[3]}%.`
  }

  const eceWrongMatch = text.match(/^ECE is ([\d.]+)% and wrong graphs are averaging ([\d.]+)% confidence\.$/)
  if (eceWrongMatch) {
    return `ECE là ${eceWrongMatch[1]}% và các đồ thị sai đang có confidence trung bình ${eceWrongMatch[2]}%.`
  }

  const overconfidentSignalMatch = text.match(/^(\d+) overconfident miss(?:es)? detected(?: and ECE is ([\d.]+)%)?\.$/)
  if (overconfidentSignalMatch) {
    return `${overconfidentSignalMatch[1]} ca sai quá tự tin đã được phát hiện${overconfidentSignalMatch[2] ? ` và ECE là ${overconfidentSignalMatch[2]}%` : ''}.`
  }

  const confVsMatch = text.match(/^Conf vs density ([+\-]?\d+\.\d+), size ([+\-]?\d+\.\d+), edges ([+\-]?\d+\.\d+), shortcut risk ([+\-]?\d+\.\d+)\.$/)
  if (confVsMatch) {
    return `Conf theo mật độ ${confVsMatch[1]}, theo kích thước ${confVsMatch[2]}, theo số cạnh ${confVsMatch[3]}, mức rủi ro shortcut ${confVsMatch[4]}.`
  }

  const shortcutStrongMatch = text.match(/^Shortcut risk is ([\d.]+); the strongest visible correlation is ([+\-]?\d+\.\d+) and should be treated as a bias signal, not a motif explanation\.$/)
  if (shortcutStrongMatch) {
    return `Shortcut risk là ${shortcutStrongMatch[1]}; tương quan mạnh nhất hiện thấy là ${shortcutStrongMatch[2]} và nên được đọc như tín hiệu bias, không phải giải thích motif.`
  }

  const bestReadMatch = text.match(/^Best read: epoch (\d+) by Macro F1(?: and Balanced Acc)?\.$/)
  if (bestReadMatch) {
    return `Mốc đọc tốt nhất: epoch ${bestReadMatch[1]} theo Macro F1${text.includes('Balanced Acc') ? ' và Balanced Acc' : ''}.`
  }

  const rationaleSplitMatch = text.match(/^Macro F1 peaks at epoch (\d+), while Balanced Acc peaks at epoch (\d+)\. Use the Macro F1 peak for headline reading, then compare the Balanced Acc peak if weak-class recall is the priority\.$/)
  if (rationaleSplitMatch) {
    return `Macro F1 đạt đỉnh ở epoch ${rationaleSplitMatch[1]}, trong khi Balanced Acc đạt đỉnh ở epoch ${rationaleSplitMatch[2]}. Hãy dùng đỉnh Macro F1 cho phần headline chính, rồi so sánh thêm đỉnh Balanced Acc nếu ưu tiên của bạn là weak-class recall.`
  }

  const rationaleDefaultMatch = text.match(/^Use this epoch when you care more about class balance and weak-class recall than raw accuracy\.$/)
  if (rationaleDefaultMatch) {
    return 'Hãy dùng epoch này khi bạn quan tâm nhiều hơn tới cân bằng lớp và weak-class recall thay vì chỉ nhìn raw accuracy.'
  }

  const subtitleMatch = text.match(/^Graph classification diagnostics for (.+?) across reliability, failures, structure, and readout behavior\.$/)
  if (subtitleMatch) {
    return `Chẩn đoán phân loại đồ thị cho ${subtitleMatch[1]} qua độ tin cậy, lỗi, cấu trúc và hành vi readout.`
  }

  const focusMatch = text.match(/^This lens is currently showing (\d+) graph(s)?\.$/)
  if (focusMatch) {
    return `Lăng kính này hiện đang hiển thị ${focusMatch[1]} đồ thị.`
  }

  const ofCollectionMatch = text.match(/^([\d.]+)% of collection$/)
  if (ofCollectionMatch) {
    return `${ofCollectionMatch[1]}% của collection`
  }

  const sliceSizeMatch = text.match(/^Slice size: (\d+)$/)
  if (sliceSizeMatch) {
    return `Kích thước lát cắt: ${sliceSizeMatch[1]}`
  }

  const graphMatchCell = text.match(/^(\d+) graphs match the active confusion cell\. The rest stay visible so you can keep structural context\.$/)
  if (graphMatchCell) {
    return `${graphMatchCell[1]} đồ thị khớp với confusion cell đang hoạt động. Phần còn lại vẫn được giữ lại để bạn không mất ngữ cảnh cấu trúc.`
  }

  const fullCollectionMatch = text.match(/^Showing the full collection in one view$/)
  if (fullCollectionMatch) {
    return 'Đang hiển thị toàn bộ collection trong một khung nhìn'
  }

  const pageMatch = text.match(/^Page (\d+)\/(\d+)$/)
  if (pageMatch) {
    return `Trang ${pageMatch[1]}/${pageMatch[2]}`
  }

  const pdfPageMatch = text.match(/^PAGE (\d+)(.*)$/)
  if (pdfPageMatch) {
    return `TRANG ${pdfPageMatch[1]}${pdfPageMatch[2] || ''}`
  }

  const latentModeMatch = text.match(/^Latent space · (predicted|correctness|confidence|entropy)$/)
  if (latentModeMatch) {
    const modeLabels = {
      predicted: 'dự đoán',
      correctness: 'độ đúng',
      confidence: 'độ tin cậy',
      entropy: 'entropy',
    }
    return `Không gian ẩn · ${modeLabels[latentModeMatch[1]]}`
  }

  const galleryModeMatch = text.match(/^Gallery · (priority|confidence|entropy|size)$/)
  if (galleryModeMatch) {
    const modeLabels = {
      priority: 'ưu tiên',
      confidence: 'độ tin cậy',
      entropy: 'entropy',
      size: 'kích thước',
    }
    return `Gallery · ${modeLabels[galleryModeMatch[1]]}`
  }

  const densityMatch = text.match(/^DENSITY: ([\d.]+%)$/)
  if (densityMatch) {
    return `MẬT ĐỘ: ${densityMatch[1]}`
  }

  const gtClassMatch = text.match(/^GT Class (\d+)$/)
  if (gtClassMatch) {
    return `Lớp thật ${gtClassMatch[1]}`
  }

  const predClassMatch = text.match(/^Pred Class (\d+)$/)
  if (predClassMatch) {
    return `Lớp dự đoán ${predClassMatch[1]}`
  }

  const cellLabelMatch = text.match(/^Pred Class (\d+) vs GT Class (\d+)$/)
  if (cellLabelMatch) {
    return `Dự đoán lớp ${cellLabelMatch[1]} so với nhãn thật lớp ${cellLabelMatch[2]}`
  }

  const statusClassMatch = text.match(/^Status (Correct|Wrong|Danger|Uncertain)$/)
  if (statusClassMatch) {
    const statusLabels = {
      Correct: 'đúng',
      Wrong: 'sai',
      Danger: 'nguy cơ cao',
      Uncertain: 'chưa chắc',
    }
    return `Trạng thái ${statusLabels[statusClassMatch[1]]}`
  }

  const marginBucketMatch = text.match(/^margin ([\d.]+%) (sparse|medium|dense)(?: (diffuse|concentrated|mixed))?$/)
  if (marginBucketMatch) {
    const densityLabels = { sparse: 'thưa', medium: 'trung bình', dense: 'dày' }
    const entropyLabels = { diffuse: 'loãng', concentrated: 'tập trung', mixed: 'pha trộn' }
    const parts = [`margin ${marginBucketMatch[1]}`, densityLabels[marginBucketMatch[2]]]
    if (marginBucketMatch[3]) parts.push(entropyLabels[marginBucketMatch[3]])
    return parts.join(' ')
  }

  const graphCollectionMatch = text.match(/^(\d+) graphs · (\d+) class profiles · (.+)$/)
  if (graphCollectionMatch) {
    return `${graphCollectionMatch[1]} đồ thị · ${graphCollectionMatch[2]} hồ sơ lớp · ${translateTask2ReportText(graphCollectionMatch[3], lang)}`
  }

  const graphTitleMatch = text.match(/^(G#\d+) — (Danger|Wrong|Uncertain|Correct) \(conf ([\d.]+%)\)$/)
  if (graphTitleMatch) {
    const statusLabels = {
      Danger: 'nguy cơ cao',
      Wrong: 'sai',
      Uncertain: 'chưa chắc',
      Correct: 'đúng',
    }
    return `${graphTitleMatch[1]} — ${statusLabels[graphTitleMatch[2]]} (độ tin cậy ${graphTitleMatch[3]})`
  }

  const classMatch = text.match(/^Class (\d+)$/)
  if (classMatch) {
    return `Lớp ${classMatch[1]}`
  }

  const supportMatch = text.match(/^support (\d+)$/i)
  if (supportMatch) {
    return `support ${supportMatch[1]}`
  }

  return text
}

export function localizeTask2Element(root, lang) {
  if (!root || lang !== 'vi') return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes = []
  while (walker.nextNode()) textNodes.push(walker.currentNode)
  for (const node of textNodes) {
    const value = node.nodeValue
    const trimmed = value?.trim()
    if (!trimmed) continue
    const translated = translateTask2ReportText(trimmed, lang)
    if (translated && translated !== trimmed) {
      node.nodeValue = value.replace(trimmed, translated)
    }
  }
  root.querySelectorAll('[title],[aria-label]').forEach((el) => {
    ;['title', 'aria-label'].forEach((attr) => {
      const current = el.getAttribute(attr)
      if (!current) return
      const translated = translateTask2ReportText(current, lang)
      if (translated && translated !== current) {
        el.setAttribute(attr, translated)
      }
    })
  })
}

export function translateTask2Signal(signal, lang) {
  if (!signal || lang !== 'vi') return signal
  return {
    ...signal,
    title: translateTask2ReportText(signal.title, lang),
    summary: translateTask2ReportText(signal.summary, lang),
    evidence: translateTask2ReportText(signal.evidence, lang),
    recommendation: translateTask2ReportText(signal.recommendation, lang),
  }
}

export function translateTask2EpochSuggestion(suggestion, lang) {
  if (!suggestion || lang !== 'vi') return suggestion
  return {
    ...suggestion,
    recommendation: translateTask2ReportText(suggestion.recommendation, lang),
    rationale: translateTask2ReportText(suggestion.rationale, lang),
  }
}

export function translateTask2FocusBucket(bucket, lang) {
  if (!bucket || lang !== 'vi') return bucket
  return {
    ...bucket,
    label: translateTask2ReportText(bucket.label, lang),
    description: translateTask2ReportText(bucket.description, lang),
  }
}

export function translateTask2FailureTagLabel(tag, lang) {
  if (lang !== 'vi') {
    switch (tag) {
      case 'overconfident_miss': return 'Overconfident miss'
      case 'diffuse_readout': return 'Diffuse readout'
      case 'structural_outlier': return 'Structural outlier'
      case 'boundary_case': return 'Boundary case'
      case 'stable_win':
      default:
        return 'Stable win'
    }
  }
  switch (tag) {
    case 'overconfident_miss': return 'Sai nhưng quá tự tin'
    case 'diffuse_readout': return 'Readout loãng'
    case 'structural_outlier': return 'Ngoại lệ cấu trúc'
    case 'boundary_case': return 'Ca vùng biên'
    case 'stable_win':
    default:
      return 'Ca ổn định'
  }
}
