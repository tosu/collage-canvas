# Task: 优化汉化多 strip 的拖拽预览/命中

## 目标
- 让跨 strip（特别是首/尾）拖拽易于命中，源节点不再留在原位；预览继续顺滑。
- 兼容当前实时预览架构：只改 transform 和命中逻辑，不破坏 drop 后一次性提交。

## 工作项
1) SlotMap 增强
   - 为每个 strip 添加 `head`/`tail` 虚拟 slot，记录坐标范围、stripIndex、type。
   - 汉化：slot 包含 xRange/yRange；普通模式保留单列。

2) 命中/边界判定重写
   - 先按 X 轴选择 strip（含 dead-zone）；再按 Y 轴 + 迟滞计算 strip 内 slot，允许命中 head/tail。
   - edge 逻辑：超出 strip 左/右时直接指向目标 strip 的 head/tail，保证首尾可达。

3) 预览源节点处理
   - 预览时对源节点应用与视觉槽位一致的 transform（或隐藏并用 placeholder），取消/完成后复位。

4) VisualPreviewEngine
   - 使用增强 slotMap 计算视觉顺序并应用 transform（含源节点）；仅在 slot 变更时刷新。

5) 验证
   - 汉化模式跨 strip/首尾插入易用，源节点不留原地残影；普通模式首尾插入正常。
   - 缩放/平移下命中正确；取消拖拽后 transform 清空。
