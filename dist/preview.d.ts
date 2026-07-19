import { ProjectAnnotations, Renderer } from 'storybook/internal/types';

/**
 * 装饰器是一种为 story 添加额外"渲染"功能的方式。许多插件定义装饰器来增强 story：
 * - 添加额外的渲染
 * - 收集 story 渲染的详细信息
 *
 * 在编写 story 时，装饰器通常用于用额外的标记或上下文模拟来包装 story。
 *
 * https://storybook.js.org/docs/react/writing-stories/decorators
 */

/**
 * 注意：如果想在此文件中使用 JSX，请将其重命名为 `preview.tsx`
 * 并在 tsup.config.ts 中将 entry prop 更新为使用 "src/preview.tsx"
 */
declare const preview: ProjectAnnotations<Renderer>;

export { preview as default };
