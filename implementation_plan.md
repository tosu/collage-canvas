# Slot 感知拖拽预览优化方案（跨 strip 友好）

## 目标
- 解决汉化多 strip 横向布局下跨 strip（尤其首/尾）命中困难的问题，让拖拽“指哪放哪”。
- 保持现有实时预览的流畅性：只用 transform 让位，数据在 drop 时一次提交。
- 兼容桌面/移动统一通路，缩放/平移状态下命中准确，无闪烁。

## 主要痛点（现状）
- 判定轴错误：汉化模式下 `resolveTarget` 仍用 Y 轴作为主轴；strip 是按 X 排列，跨列时几乎不会触发 edge/命中。
- 缺少虚拟 slot：slotMap 仅包含已有图片 box，没有“头/尾”虚拟槽；想插到 strip 的最前或最后没有可命中的区域。
- 预览源节点未让位：被拖元素保持在起点（透明但不移位），在跨 strip 时遮挡/误导。
- 边界判定未分离：edge 与 nearest 逻辑耦合到单轴，跨 strip 时无独立的“选 strip → 选位”流程。

## 设计原则
- **先选 strip，再选位置**：按 X 轴（汉化）确定目标 strip，再按 Y 轴（或顺序）确定插入索引；普通模式保持单列逻辑。
- **显式虚拟槽**：为每个 strip 构建 `head` / `tail` slot，提供首/尾插入的命中区域，配合迟滞。
- **拖拽源让位**：源元素在预览中也随视觉槽位移动（或隐藏），避免原地残影干扰判定。
- **状态机 + 迟滞**：slot 变更才触发预览更新；跨 strip/跨槽各自有 0.3/0.7 迟滞阈值。
- **快照计算**：继续使用 drag-start 的 layout/scale/pan 快照，预览仅用 transform，不触发布局重排。

## 实施计划
1) **SlotMap 增强**
   - 为每个 strip 生成 `head` / `tail` 虚拟 slot（坐标覆盖 strip 区域的顶部/底部或前/后），写入 `type: 'head'|'tail'`。
   - 在汉化模式下，slot 包含 `stripIndex`、`xRange`、`yRange`；普通模式保持一维。

2) **命中与边界判定重写**
   - 汉化：先根据 X 轴落点选择 strip（含 DEAD_ZONE），无匹配时保持当前 strip；strip 内再用 Y 轴 + 迟滞计算插入点，允许命中 head/tail slot。
   - 普通模式：沿现有轴，但支持 head/tail slot，迟滞不变。
   - edge 逻辑：当落点超出 strip 左/右侧时，直接指向目标 strip 的 head/tail，确保首尾易达。

3) **预览源节点移动/隐藏**
   - 在预览引擎中，对 `sourceId` 应用与视觉槽位一致的 transform（或在拖拽时隐藏源节点并用 mirror/placeholder 占位）；取消后复位。

4) **VisualPreviewEngine 调整**
   - 基于目标 slot 重新计算视觉顺序：`dragSlot → targetSlot`，空出一格并给源节点应用 transform。
   - 预览输入使用增强的 slotMap（含虚拟槽），strip 切换时只在 slot 改变时更新。

5) **验收清单**
   - 汉化模式：跨 strip 到首/尾一拖即中；横向移动能稳定切 strip，纵向能精准落位；源节点不留原地残影。
   - 普通模式：首尾插入正常；预览依旧平滑。
   - 缩放/平移状态下命中正确；取消拖拽时 transform 清理干净。
