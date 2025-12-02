# Bugfix Plan: 空状态交互范围 & 发光特效控制

## 现象
1. 空状态下，整个 `.empty-state` 都能拖入/点击上传；期望仅 `.drop-card`（及按钮）响应。
2. 拖入时发光/虚线框特效作用于整个 empty 区域；应只在卡片上。
3. `.drop-card` 内出现 I 形光标，可选中文本；应保持默认/指针，仅按钮为 pointer。

## 目标
- 收窄交互：只有 `.drop-card` 是拖入目标；只有 “选择图片” 按钮触发上传。
- 发光特效只在 `.drop-card` 激活。
- 去除卡片内文本选择/I 型光标。
- 不影响已有行为：已有内容时依旧可全局拖入文件（目前 dropZone 允许），排序拖拽不受干扰。

## 调整方案
1) JS 事件范围
   - `dragover/drop`: 在空状态时仅当 `e.target.closest('.drop-card')` 为真才 `preventDefault`、添加 hover/drag-over 类；否则忽略，让默认行为通过。
   - `dragleave`: 仅在离开卡片时移除类。
   - 点击上传：只在 `e.target.closest('.ghost-btn')` 或卡片内特定按钮时触发 `fileInput.click()`；移除对整个 `.empty-state` 的点击响应。
   - 保留已有内容时的全局文件拖入逻辑（dropZone 外层仍可接收文件），需条件分支区分 empty vs has-content。
2) CSS
   - 将发光/虚线框效果从 `.drop-zone.drag-over::after` 改为 `.drop-card.drag-over::after`（或增加 `.drop-card.drag-over` 样式），避免整个区域高亮。
   - `.drop-card`, `.drop-card *`: `user-select: none; cursor: default;`；按钮 `.ghost-btn` 设置 `cursor: pointer`。
3) 冲突检查
   - 确保排序拖拽使用的 `dragover` 不被阻断：添加 guard（仅当 `dragSrcId` 为空且 empty 状态时才走文件拖入分支）。
   - 移动端点击空白不触发上传，保持现有逻辑。

## 验收
- 空状态时只有卡片区域可拖入，发光/虚线只在卡片；点击卡片空白无效，按钮可上传。
- 卡片内无 I 形光标，文本不可选；已有内容时拖入行为与排序不回归。***
