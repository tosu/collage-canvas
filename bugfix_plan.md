# Bugfix Plan: Toast 显示位置与样式异常

## 现象
- Toast 消息出现在渲染区域右侧，样式缺失或未按预期定位，显得杂乱、不美观。

## 可能原因
- toast 容器 `.toast-container` 的样式缺失/未生效：定位、宽度、背景、过渡等未定义或被覆盖。
- 容器插入位置不正确：DOM 在预览区域内导致相对定位到内容右侧，而非固定到视口或页面角落。
- 样式冲突：全局样式或移动端样式覆盖了 toast 的定位/布局。

## 修复思路
- 确认 DOM：toast 容器应放在顶层（如 `body` 内的绝对/固定定位），或在 `dropZone` 内但用 `position: fixed/absolute` 钉在视口右上角/右下角。
- 统一样式：为 `.toast-container`、`.toast` 定义清晰的定位、尺寸、背景、边距和阴影，避免继承导致错位。
- 渐隐动画：使用 `opacity` + `transform` 过渡让出现/消失更自然。

## 实施步骤
1) 样式补全
   - `.toast-container`: `position: fixed; top/bottom + right; z-index: high; display: flex; flex-direction: column; gap; max-width`.
   - `.toast`: 背景、文字颜色、圆角、阴影、内边距、过渡（opacity + translateY），初始/隐藏状态。
2) DOM 位置
   - 确认 `toastContainer` 在 `index.html` 的位置；如需，移动到 `body` 下或确保其定位上下文可控。
3) 动效
   - 保持现有移除逻辑或增加类名控制动画（可选：在插入时添加 `show` 类，延迟后移除）。

## 验收
- Toast 固定在指定角落（如右上/右下），不随内容漂移；样式一致、可读。
- 出现/消失平滑，无覆盖核心内容。*** End Patch
