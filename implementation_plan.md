# 拖拽排序实时预览方案（原生 JS，interact.js 风格）

## 目标
- 拖拽中提供顺滑、可预期的实时预览：空出槽位、其他项让位，指哪放哪，无闪烁/抖动。
- 桌面与移动端共用一套排序内核与预览引擎；兼容汉化多 strip 布局与缩放/平移。
- 不破坏现有导出/文件拖入/缩放功能，保持性能（尽量只做 transform 与 rAF）。

## 关键思路（结合 interact.js 示例/Pro 特性）
- **数据与视觉分离**：拖拽时不改业务数组/DOM 顺序；仅维护“视觉槽位”并用 transform 预览，drop 时一次性 commit。
- **slot 离散 + 迟滞**：pointer 映射到 slot（网格/索引），进入 slot 的 30%/70% 以后才认定切换，避免边界 ping-pong。
- **几何快照**：drag-start 记录 `lastLayout` 的基准坐标（含 strip 偏移、scale/pan 快照），命中与 transform 计算都基于快照，render 期间不漂移。
- **预览引擎**：维护 `dragIndex` / `targetIndex`（或 strip+index），根据两者计算每个 item 的“视觉槽位”，对非拖拽项应用 `translate3d` 让位；拖拽项用 mirror 跟手。
- **动画**：非拖拽项的 transform 走短时过渡或 spring（CSS transition 120~180ms ease-out），拖拽项无过渡。
- **状态机**：`start → move(slotChange?) → preview transform → drop/cancel`，只有 slot 变更才触发预览重排；取消时复位所有 transform。

## 实施计划
1) **SlotMap 构建与指针映射**
   - 基于 `lastLayout` 构建 slot 列表：含 stripId、index、box(x,y,w,h)、进入前/后阈值（0.3/0.7）和末尾 slot（尾部插入）。
   - drag-start 保存 scale/pan/baseOffset 快照；提供 `client → logical` 的转换；封装 `hitTestSlot(relX, relY)` 返回 slot + insertAfter。

2) **预览引擎（VisualPreviewEngine）**
   - 记录 `dragSlot`（起点）与 `targetSlot`（当前命中），提供 `computeVisualSlotIndex(itemSlot, dragSlot, targetSlot)`，对同 strip/同列按“空出一格”的规则计算视觉索引。
   - 输出每个 item 应用的 `translate3d(dx, dy)`（相对其原始 box），拖拽项用 mirror 跟手，非拖拽项添加/更新 `preview-transform` 样式并设置 transition。
   - 支持跨 strip：targetSlot 若在其他 strip，视觉计算需考虑 strip 偏移（x 基础位移），并允许/禁止跨 strip 按当前规则。

3) **输入集成（鼠标/触摸统一）**
   - pointerdown/long-press 启动 session：创建 mirror，锁定 slotMap 快照；禁用/绕过 HTML5 原生排序 drag，仅保留文件拖入。
   - pointermove/touchmove：用 slotMap + 迟滞计算新 targetSlot，仅当 slot 变更时调用预览引擎刷新 transform；其余帧只移动 mirror。
   - pointerup/cancel：若 targetSlot 有变化则 commit（更新 `loadedImages/strips`），否则放弃；清理 mirror 与所有 transform。

4) **Commit / Cancel 与复位**
   - drop 时：根据 dragSlot→targetSlot 对 `loadedImages` 或 `strips` 做一次 move；清零所有 `preview-transform` 样式与 transition，调用 `render()` 使 DOM 顺序与视觉一致。
   - cancel 时：不改数据，移除所有预览 transform 和指示器。

5) **样式与性能**
   - 新增 CSS 类：`.preview-shift { transition: transform 150ms ease-out; will-change: transform; }`；拖拽项 `.dragging` 无过渡。
   - 预览刷新用 rAF，计算轻量（基于快照与索引，不读写布局）；避免在 move 中触发 `render()`。

6) **验收用例**
   - 桌面：拖拽任意项，其他项平滑让位；临界 ±5px 不抖；放开后位置正确；缩放/平移状态下命中仍准确。
   - 移动：长按拖拽同样顺滑；双指缩放后仍能正确命中；快速滑动不丢事件。
   - 汉化模式：跨/内 strip 让位正确，末尾插入正常，分隔线不漂移；文件拖入/导出无回归。
