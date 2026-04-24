# FILE.md — Đánh giá khuyết điểm và lộ trình nâng cấp GNN Visualization

## 1) Tóm tắt điều hành

Dự án `GNN-Insight` đã có nền tảng tốt: 6 tác vụ, 3 mô hình, playback theo epoch, và hệ thống FE/BE vận hành được. Tuy nhiên, giá trị cốt lõi của một hệ thống "khả thị hóa để hiểu sâu hơn" hiện chưa được chứng minh đầy đủ bằng dữ liệu và luồng insight thống nhất.

Vấn đề lớn nhất không phải thiếu chart, mà là thiếu khung đo lường rõ ràng cho câu hỏi:

- Khi **không** hiển thị hóa, người dùng biết gì? (A)
- Khi **có** hiển thị hóa, người dùng biết thêm gì để ra quyết định tốt hơn? (B)
- B có thật sự lớn hơn A theo chỉ số đo được không?

Tài liệu này chuẩn hóa câu trả lời, chỉ ra khuyết điểm và đề xuất nâng cấp FE/BE theo lộ trình khả thi.

---

## 2) Mục tiêu sản phẩm theo khung A vs B

## A — Không hiển thị hóa (chỉ log/metric tĩnh)

Người dùng thường chỉ thấy:

- Metric tổng cuối kỳ: `val_acc`, `loss`, `AUC`, `modularity`.
- Một vài biểu đồ line cơ bản theo epoch.
- Kết luận "model tốt/xấu" ở mức tổng quát.

Giới hạn của A:

- Không biết node/edge nào gây lỗi.
- Không thấy diễn tiến lỗi theo thời gian.
- Không phân biệt rõ lỗi do dữ liệu, do kiến trúc, hay do huấn luyện.
- Khó chuyển từ "quan sát" sang "hành động" (tối ưu hyperparams, sửa data, chọn model).

## B — Có hiển thị hóa (multi-view + diagnostic)

Người dùng cần thấy được:

- Diễn tiến học theo epoch trên topology + embedding + metrics đồng bộ.
- Nhóm lỗi/misclassification được định vị theo node, edge, community, hoặc latent region.
- Cơ chế model (attention/K-hop/bridge/outlier) gắn trực tiếp với lỗi và độ tin cậy.
- Tín hiệu chẩn đoán đủ cụ thể để quyết định bước tiếp theo.

Kết luận mục tiêu:

- **B phải lớn hơn A** không chỉ ở "đẹp hơn", mà ở **khả năng ra quyết định tốt hơn, nhanh hơn, chính xác hơn**.

---

## 3) Bằng chứng đã rà soát

Tài liệu chính đã đọc:

- `README.md`
- `PROJECT_OVERVIEW.md`
- `PROGRESS_TRACKER.md`
- `VISUALIZATION_IMPROVEMENTS.md`
- `GNN_ANIMATION_FINAL.md`
- `GNN_INSIGHT_MASTER_PROMPT.md`

Đối chiếu từ code FE/BE:

- FE hardcode endpoint:
  - `frontend/src/hooks/useWebSocket.js`
  - `frontend/src/components/TrainingControlsV2.jsx`
  - `frontend/src/components/Library/ProjectLibrary.jsx`
  - `frontend/src/components/UploadPanel/DataInputView.jsx`
  - `frontend/src/components/TopologyView/InductiveDemo.jsx`
- Task 1 error mode đang bị khóa logic trong:
  - `frontend/src/components/TopologyView/TopologyView.jsx`
- BE đã tính thêm tín hiệu sâu nhưng FE chưa khai thác đầy đủ:
  - `backend/tasks/graph_embedding.py`: `outlier_scores`, `per_edge_reconstruction_error`
  - `backend/tasks/graph_generation.py`: `comparison_metrics`

Lưu ý về "skills của agent và dự án":

- `PROJECT_OVERVIEW.md` mô tả có `.agents/skills/...`
- Nhưng trong repo hiện tại không tìm thấy `SKILL.md` nội bộ dự án (không có `.agents/skills` khả dụng tại thời điểm rà soát).

---

## 4) Mâu thuẫn tài liệu cần chốt ngay (Source of Truth Gap)

### 4.1 Mâu thuẫn trạng thái tính năng

- `README.md` ghi có keyboard shortcuts.
- `PROGRESS_TRACKER.md` lại ghi keyboard shortcuts chưa làm (`I5`).

### 4.2 Mâu thuẫn về Task 1 K-hop

- `PROGRESS_TRACKER.md` có mục Sprint 3 ghi K-hop backend/frontend chưa làm.
- `VISUALIZATION_IMPROVEMENTS.md` lại ghi K-hop đã hoàn thành.

### 4.3 Mâu thuẫn về mức độ hoàn thiện

- `PROJECT_OVERVIEW.md` mô tả trạng thái ổn định, đầy đủ.
- `PROGRESS_TRACKER.md` vẫn còn backlog đáng kể cho Task 5/6 và export/report.

Tác hại:

- Team khó biết đâu là trạng thái thật.
- Ưu tiên sai hạng mục.
- Khó chứng minh tiến độ với stakeholder.

---

## 5) Khuyết điểm cốt lõi của dự án hiện tại

## 5.1 Product/Documentation (Mức nghiêm trọng: Cao)

- Thiếu một file "release truth" duy nhất phân loại rõ: Done / Partial / Planned / Deprecated.
- Chưa có bảng chứng minh hiệu quả trực quan hóa bằng KPI trước-sau.
- Chưa có matrix kiểm thử theo task-model-dataset.

## 5.2 Frontend (Mức nghiêm trọng: Cao)

- Hardcode endpoint `localhost` làm giảm khả năng deploy/test môi trường khác.
- Luồng lỗi Task 1 (misclassification explorer) bị khóa logic an toàn, làm yếu khả năng chẩn đoán.
- Một số tín hiệu backend có giá trị cao chưa được "nâng cấp thành insight UI".
- `App.jsx` và orchestration đa nhiệm vụ còn nặng, khó mở rộng.

## 5.3 Backend (Mức nghiêm trọng: Trung bình-Cao)

- Snapshot schema chưa có versioning contract rõ theo task.
- Chưa có tier metric theo kích thước đồ thị (fast/standard/deep).
- Metadata tái lập thí nghiệm (seed, split strategy, preprocessing summary) chưa được chuẩn hóa thành hợp đồng báo cáo.

## 5.4 Kiến trúc insight (Mức nghiêm trọng: Cao)

- Có nhiều metric, nhưng chưa có "Insight Engine" hợp nhất để biến dữ liệu thành giải thích hành động.
- Người dùng vẫn dễ rơi vào tình trạng xem nhiều nhưng quyết định ít.

---

## 6) Nâng cấp Frontend đề xuất

## FE-1) Chuẩn hóa cấu hình endpoint (Quick Win)

- Dùng biến môi trường:
  - `VITE_API_BASE_URL`
  - `VITE_WS_URL`
- Thay toàn bộ hardcode URL trong các component/hook liên quan.

Giá trị:

- Deploy linh hoạt hơn.
- Giảm lỗi môi trường khi demo/production.

## FE-2) Mở lại và hoàn thiện luồng Error Diagnostic Task 1

- Bật lại filter misclassified và link với confusion matrix.
- Luồng mục tiêu:
  - click cell confusion matrix -> highlight node set -> focus node đầu tiên -> panel giải thích.

Giá trị:

- Tăng mạnh năng lực "truy nguyên lỗi", đúng tinh thần B > A.

## FE-3) Insight Panel thống nhất cho 6 tasks

- Tạo một panel chuẩn với cấu trúc:
  - `What happened`
  - `Why likely`
  - `What to try next`
- Mỗi task map vào cùng format (confidence, drift, outlier, bridge, etc.).

Giá trị:

- Giảm cognitive load.
- Dễ so sánh cross-task/cross-model.

## FE-4) Khai thác tín hiệu chưa dùng của Task 5/6

- Task 5:
  - Visual `outlier_scores`
  - Visual `per_edge_reconstruction_error`
- Task 6:
  - Visual `comparison_metrics` (độ lệch so với đồ thị nguồn/target properties)

Giá trị:

- Chuyển dữ liệu thô backend thành insight thực dụng.

## FE-5) Refactor kiến trúc module theo task registry

- Tách cấu hình route/panel theo map cấu hình thay vì if/switch rải rác.
- Gom metadata task vào 1 nguồn.

Giá trị:

- Mở rộng nhanh hơn.
- Dễ kiểm thử và giảm regression.

---

## 7) Nâng cấp Backend đề xuất

## BE-1) Snapshot Contract + Versioning

- Định nghĩa schema Pydantic per-task.
- Có `schema_version` trong mọi snapshot/experiment.

Giá trị:

- Giảm drift FE/BE.
- Replay cũ vẫn chạy khi nâng cấp.

## BE-2) Metric Tier theo quy mô đồ thị

- `fast`: metric nhẹ, tương tác mượt.
- `standard`: cân bằng.
- `deep`: đầy đủ, ưu tiên phân tích.

Giá trị:

- Hỗ trợ dataset lớn mà không đánh đổi toàn bộ UX.

## BE-3) Manifest insight cho mỗi run

- Mỗi experiment lưu:
  - metric nào có/không có
  - độ tin cậy của metric
  - cảnh báo chất lượng dữ liệu

Giá trị:

- FE biết hiển thị đúng khả năng.
- Tránh "panel trống không rõ lý do".

## BE-4) Chuẩn hóa stop/cancel end-to-end

- Đồng bộ sự kiện stop giữa FE control và backend training loop.
- Trả trạng thái hủy rõ trong stream/report.

Giá trị:

- UX huấn luyện đáng tin cậy hơn.

## BE-5) Chuẩn hóa reproducibility metadata

- Bắt buộc lưu:
  - random seed
  - split strategy
  - preprocessing steps
  - data snapshot ID/hash

Giá trị:

- So sánh công bằng model.
- Tăng độ tin cậy nghiên cứu và báo cáo.

---

## 8) Roadmap triển khai 30/60/90 ngày

## 30 ngày (Quick Wins - tác động nhanh)

- Chốt "source of truth" trạng thái tính năng.
- Env hóa toàn bộ endpoint FE.
- Bật lại Task 1 error explorer.
- Kéo tín hiệu Task 5/6 quan trọng vào UI.

Kết quả kỳ vọng:

- Người dùng bắt đầu thấy rõ "lỗi ở đâu, vì sao" thay vì chỉ xem biểu đồ.

## 60 ngày (Insight sâu)

- Insight Panel thống nhất 6 task.
- Snapshot schema versioning + manifest.
- Report run có phần "khuyến nghị hành động".

Kết quả kỳ vọng:

- Rút ngắn thời gian chẩn đoán nguyên nhân.

## 90 ngày (Scale + Reliability)

- Metric tier cho large graphs.
- Refactor FE module hóa theo task registry.
- Bộ test hồi quy luồng playback + diagnostic + report.

Kết quả kỳ vọng:

- Hệ thống ổn định khi mở rộng dataset và tính năng.

---

## 9) KPI để chứng minh "B > A"

## 9.1 Information Gain KPI (IG-KPI)

Đề xuất điểm tổng:

`IG = 0.35 * DiagnosticDepth + 0.25 * DecisionReadiness + 0.20 * TemporalClarity + 0.20 * Reproducibility`

Trong đó:

- `DiagnosticDepth`: số lượng lỗi có thể truy nguyên đến node/edge/community cụ thể.
- `DecisionReadiness`: tỷ lệ phiên có gợi ý hành động rõ (tune gì, dữ liệu nào cần xem lại).
- `TemporalClarity`: khả năng theo dõi nguyên nhân theo epoch, không chỉ cuối kỳ.
- `Reproducibility`: khả năng tái lập kết quả cùng metadata.

## 9.2 KPI vận hành đề xuất

- Time-to-root-cause (TTRC): thời gian từ phát hiện metric xấu đến xác định nguyên nhân chính.
- Insight Coverage: % run có ít nhất 1 insight hành động hóa.
- FE-BE Contract Health: % run không lỗi schema mismatch.
- Doc Consistency Score: số mâu thuẫn tài liệu còn tồn tại theo checklist release.

Mục tiêu:

- Sau 90 ngày, IG-KPI tăng tối thiểu 40% so với baseline hiện tại.

---

## 10) Definition of Done cho mục tiêu hiển thị hóa

Một phiên training được coi là đạt "B > A" khi đồng thời thỏa:

- Có thể chỉ ra cụ thể vùng lỗi (node/edge/community/latent).
- Có thể giải thích bằng ít nhất 1 cơ chế model hoặc cấu trúc graph.
- Có khuyến nghị hành động tiếp theo, không dừng ở mô tả.
- Có metadata đủ để tái lập và so sánh với run khác.
- Tài liệu trạng thái tính năng nhất quán với hành vi thật của hệ thống.

---

## 11) Kết luận

Dự án đã có nền kỹ thuật mạnh, nhưng để trở thành một nền tảng "khả thị hóa giúp hiểu và quyết định tốt hơn", cần chuyển trọng tâm từ "nhiều biểu đồ" sang "nhiều insight có thể hành động".

Hướng đi tối ưu hiện tại:

- Chốt source-of-truth tài liệu.
- Đóng các khoảng trống diagnostic quan trọng (đặc biệt Task 1, Task 5, Task 6).
- Chuẩn hóa hợp đồng dữ liệu FE/BE.
- Đo lường B > A bằng KPI cụ thể.

Nếu làm đúng lộ trình này, dự án sẽ vượt khỏi mức demo trực quan và tiến tới một công cụ phân tích GNN đáng tin cậy cho học tập, nghiên cứu và trình bày kỹ thuật.
