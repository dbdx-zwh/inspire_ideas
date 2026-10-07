/**
 * 全局类型定义 - 从 shared 包重导出
 * ----------------------------------------
 * 保持向后兼容的导入路径 `@/types`；实际类型定义与运行时校验在
 * packages/shared 里，前后端共享。
 */

export * from '../../packages/shared/src';
