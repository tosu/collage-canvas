# Bugfix Plan: 无法将后面的元素拖到列表首位（普通模式）

## 现象
- 列表 `[A B C D]` 中，将 `B/C/D` 拖到 `A` 前面时，没有预览提示，也无法完成排序。
- 反向操作（把 `A` 拖到后面或原位）正常。

## 根因分析
- 普通模式的命中逻辑仅按 Y 轴/槽内命中；head/tail 区域要求指针的 X 落在现有内容范围内。
- 当指针在列表最左侧（`minX` 之外）尝试插入首位时：
  - `hitSlot` 失败（X 不在任一 box 内）；
  - `head` 区域也失败（X 不在 strip 宽度范围内）；
  - 边界/nearest 逻辑只看 Y，不处理“左侧越界插入”，最终返回 null → 无预览/无排序。
- 因此缺少“左/右边界插入”分支，导致首/尾插入在 X 越界时不可达。

## 修复思路
- 在普通模式下，为 strip 添加显式的左右越界判定：指针 X < `minX - EDGE_DEAD_ZONE` 时直接指向首项（insertBefore），X > `maxX + EDGE_DEAD_ZONE` 指向尾项（insertAfter）。
- 扩展 head/tail 区域的 X 范围（或在越界分支中忽略 X，按 Y 对齐当前 strip）以保障首位插入可达。
- 保持现有迟滞/预览 transform 逻辑不变，确保只影响命中判定。

## 计划步骤
1) 记录 strip 的 `minX/maxX`（已有 `stripMeta`），在普通模式的命中函数里增加 X 越界判定：
   - `if (relX < minX - EDGE_DEAD_ZONE) -> target firstId, insertAfter=false`
   - `if (relX > maxX + EDGE_DEAD_ZONE) -> target lastId, insertAfter=true`
2) 可选：将 head/tail hit 区域的 X 范围扩展为 `minX - EDGE_DEAD_ZONE` 到 `maxX + EDGE_DEAD_ZONE`，防止因微小偏差 miss。
3) 保持其余判定（hit/nearest/hysteresis）不变，确保已有预览/提交流程不受影响。

## 验收
- 普通模式下，将任意元素拖到列表最前/最后都能触发预览并完成排序，即便指针在内容左/右侧略微越界。
- 其他场景（跨行、插中间、汉化模式）行为无回归。***
