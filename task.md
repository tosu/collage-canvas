# Task: 落地原生 JS 实时拖拽排序预览

## 目标/范围
- 依照新的 implementation_plan 实现 interact.js 风格的 transform 预览：拖拽中只动视觉槽位，drop 时才改数据。
- 桌面/移动统一通路，兼容汉化多 strip 与缩放/平移，保持现有上传/导出无回归。

## 工作项
1) SlotMap & 输入快照
   - 基于 `lastLayout` 生成 slot 列表（含 stripId、index、box、尾部 slot、0.3/0.7 阈值）。
   - drag-start 保存 scale/pan/baseOffset；封装 client→logical 映射与 `hitTestSlot`（含迟滞）。

2) 预览引擎（VisualPreviewEngine）
   - 维护 `dragSlot`/`targetSlot`，实现 `computeVisualSlotIndex` 按“空出一格”规则计算视觉索引。
   - 为非拖拽项设置 `translate3d` 预览位移 + `.preview-shift` 过渡；拖拽项 mirror 跟手。
   - 支持跨 strip 偏移计算，遵循现有跨 strip 允许/禁止规则。

3) Session 集成（鼠标/触摸）
   - pointerdown/长按启动 session，禁用原生排序 drag，创建 mirror，锁定 slotMap。
   - move 时仅在 slot 变更刷新预览 transform；其它帧只移动 mirror。
   - up/cancel 时：有变化则 move 数据一次并 `render()`；无变化则复位；清理所有 transform/indicator。

4) 样式与清理
   - 添加/复用 `.preview-shift`、`.dragging` 的过渡策略；确保 cancel/drop 后 transform/transition 清零。

5) 验证
   - 桌面/移动临界不抖、末尾插入正常；缩放/平移后命中正确；汉化模式跨/内 strip 让位正确；上传/导出无回归。
