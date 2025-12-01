# Bugfix Plan: 排序完成时元素“飞入”动效过大

## 问题现象
排序结束后，受影响的项会从远处飞入新位置（例如 `[A B]` -> `[B A]` 时，B 从左飞入、A 从右飞入），动画动静过大。

## 根因
- 预览阶段对受影响元素应用了 `transform` + `.preview-shift`（带 transition）。
- 提交时 `commit()` 先改数据并 `render()`，写入新的 `left/top`/DOM 顺序，但旧的预览 `transform` 仍保留。
- 紧接着 `cleanup()` 清空 `transform`，触发 transition：元素从旧预览位移过渡到 0，基座位置已变为新 slot，形成“大幅飞入”效果。

## 目标
- 保持预览阶段的平滑让位，但在提交/取消时避免因残留 transform + transition 导致的跨距离动画。

## 方案
1) **提交/取消前先移除预览 transform**
   - 在 `commit()` 调用 `render()` 之前，调用 `previewEngine.resetAll()` 且暂时移除 `.preview-shift`（或清理 inline transition），确保提交后不再有残留 transform。
   - 或在 `cleanup()` 开头无 transition 地清零 transform（临时禁用/覆写 transition），再 `render()`，避免过渡。

2) **原子更新顺序**
   - 顺序调整为：停止预览 → 清 transform/transition → 提交数据 + render → 恢复默认样式。

3) **可选：提交阶段禁用动画**
   - 提交前给受影响元素添加类如 `.no-transition` 禁用 transform transition，清零后移除该类。

## 验收
- 排序完成时元素无“跨半屏飞入”效果，只是位置即时更新或轻微过渡。
- 预览阶段行为不变，取消排序也不会出现飞入。***
