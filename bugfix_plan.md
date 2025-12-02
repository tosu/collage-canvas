# Bugfix Plan: 预览区域不应出现文本选择/I 形光标

## 现象
- 在预览/图片区域，鼠标悬停时出现 I 形文本光标，可拖动选择图片或区域，影响拖拽排序与交互体验。

## 可能原因
- 预览容器及其子元素未禁用文本选择（未设置 `user-select: none`）。
- 浏览器默认行为对图片/文本节点允许 selection；拖拽镜像或标签（如文件名）也可能可选。

## 修复方案
- CSS 全局或针对预览容器禁用选择：对 `.preview-wrapper`, `.preview-container`, `.image-item`, `.filename-badge` 等设置 `user-select: none; -webkit-user-select: none;`。
- 确保鼠标指针为 `default` 或 `grab`（根据拖拽态），避免文本光标。
- 若存在文本节点（文件名 badge），也需禁用选择。

## 实施步骤
1) 在 `style.css` 中为预览相关元素添加：
   - `user-select: none; -webkit-user-select: none;`
   - `cursor: default;`（基础态），拖拽时已有 `.dragging` 控制即可。
2) 确认 badge/提示文字不被选中：对 `.filename-badge`, `.preview-hint` 等同样禁用选择。
3) 验收：
   - 在预览区域悬停不再出现 I 形光标；拖动不会选中文本/图片。
   - 其他输入控件（侧栏表单）仍可选中文本。***
