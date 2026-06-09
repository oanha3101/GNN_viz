# Plan cải thiện hệ thống GNN Visualization

## Goal
Chuẩn hóa luồng Frontend → Backend → Database để UI phân biệt rõ GCN, GAT, GraphSAGE và hiển thị metrics/training/attention dễ phân tích.

## Phases
- [ ] Phase 0: Audit hiện trạng FE/BE/DB, xác định file Task 6, API model, schema DB đang dùng → Verify: có danh sách file/endpoint/table cần sửa.
- [ ] Phase 1: Thiết kế unified model output contract cho GCN/GAT/GraphSAGE gồm prediction, probabilities, embeddings, metrics, graph overlays, attention optional → Verify: 3 model trả cùng JSON shape, GAT có attention, GCN/GraphSAGE trả `attention: null` hoặc `unsupported` rõ ràng.
- [ ] Phase 2: Refactor Backend bằng adapter/service riêng cho từng model nhưng cùng contract response → Verify: gọi API train/evaluate của 3 model đều map được sang cùng schema UI.
- [ ] Phase 3: Chuẩn hóa Database cho graph, node_features, embeddings, training_runs, training_metrics, visualization_artifacts → Verify: mỗi training run truy xuất được loss/accuracy history, embedding snapshot, graph metadata.
- [ ] Phase 4: Redesign IA Frontend theo model-aware UI: selector GCN/GAT/GraphSAGE, cards giải thích khác biệt, visual encoding riêng cho convolution/attention/sampling → Verify: user nhìn UI biết model nào đang chạy và vì sao output khác nhau.
- [ ] Phase 5: Cải thiện Task 6 layout thành 3 vùng: left control/config, center graph visualization, right insight pane → Verify: Task 6 có workflow rõ: chọn model → train/evaluate → xem graph/metrics/insight.
- [ ] Phase 6: Nâng cấp right pane metrics gồm loss/accuracy chart, attention panel cho GAT, embedding summary, confusion/prediction summary → Verify: pane không chỉ hiển thị raw data mà có chart và insight dễ đọc.
- [ ] Phase 7: Kết nối FE với unified API contract, bỏ mapping riêng lẻ cho từng model nếu không cần → Verify: đổi model không làm vỡ UI, missing field hiển thị trạng thái hợp lệ.
- [ ] Phase 8: Verification cuối: chạy backend tests, frontend type/build, manual UI test Task 6 và 3 model path → Verify: GCN/GAT/GraphSAGE đều chạy qua cùng luồng và hiển thị đúng metrics.

## Done When
- [ ] GCN, GAT, GraphSAGE có output đồng bộ và UI dùng cùng một contract.
- [ ] Task 6 có layout rõ ràng, có chart metrics và attention visualization cho GAT.
- [ ] DB lưu được graph/features/embeddings/training results phục vụ visualization.
- [ ] Test backend/frontend và kiểm thử UI golden path đều pass.

## Notes
Không triển khai code trước khi Phase 0 được review/đồng ý. Nếu cần giảm scope, ưu tiên Phase 1 → Phase 2 → Phase 5 → Phase 6 trước, DB migration làm sau.
