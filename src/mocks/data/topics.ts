import type { Topic } from '@/types';

export const mockTopics: Topic[] = [
  // 推荐系统
  { id: 't_1', name: '推荐系统', parentId: null, paperCount: 12, createdAt: '2026-06-01' },
  { id: 't_1_1', name: '序列建模', parentId: 't_1', paperCount: 5, createdAt: '2026-06-02' },
  { id: 't_1_1_1', name: '长短期融合', parentId: 't_1_1', paperCount: 3, createdAt: '2026-06-03' },
  { id: 't_1_1_2', name: '注意力机制', parentId: 't_1_1', paperCount: 2, createdAt: '2026-06-03' },
  { id: 't_1_2', name: '多目标学习', parentId: 't_1', paperCount: 4, createdAt: '2026-06-05' },
  { id: 't_1_3', name: '冷启动', parentId: 't_1', paperCount: 3, createdAt: '2026-06-10' },
  // 大模型
  { id: 't_2', name: '大模型', parentId: null, paperCount: 8, createdAt: '2026-06-15' },
  { id: 't_2_1', name: '长文本', parentId: 't_2', paperCount: 5, createdAt: '2026-06-16' },
  { id: 't_2_2', name: 'MoE', parentId: 't_2', paperCount: 3, createdAt: '2026-06-18' },
  // 强化学习
  { id: 't_3', name: '强化学习', parentId: null, paperCount: 6, createdAt: '2026-07-01' },
];

/** 归档记录 · 建立论文与目录的关联 */
export const mockArchiveMap: Record<string, string[]> = {
  // paperId -> topicIds
  p_004: ['t_1_1_1'],
  p_005: ['t_1_1_1'],
  p_007: ['t_2_2'],
  p_010: ['t_1_2'],
  p_011: ['t_1_1_2'],
};
