/**
 * Mock 内存数据库
 * ----------------------------------------
 * 所有 MSW handler 共享这份状态。页面操作会真实修改这里的数据，
 * 从而模拟后端持久化行为（页面刷新会重置为初始值，符合 Mock 语义）。
 */

import type {
  AICard,
  Anchor,
  ArchiveEntry,
  Blogger,
  ChatMessage,
  Idea,
  Paper,
  ReaderChatMessage,
  Topic,
} from '@/types';
import { mockPapers } from './data/papers';
import { mockBloggers } from './data/bloggers';
import { mockArchiveMap, mockTopics } from './data/topics';
import { nanoid } from 'nanoid';

export interface MockDb {
  papers: Paper[];
  bloggers: Blogger[];
  topics: Topic[];
  archiveEntries: ArchiveEntry[];
  ideas: Idea[];
  anchors: Anchor[];
  chatMessages: ChatMessage[];
  aiCards: AICard[];
  readerChat: ReaderChatMessage[];
}

function buildInitialArchive(): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  Object.entries(mockArchiveMap).forEach(([paperId, topicIds]) => {
    topicIds.forEach((topicId) => {
      entries.push({
        id: 'ae_' + nanoid(6),
        paperId,
        topicId,
        summary: '',
        createdAt: new Date().toISOString(),
      });
    });
  });
  return entries;
}

export const db: MockDb = {
  papers: JSON.parse(JSON.stringify(mockPapers)),
  bloggers: JSON.parse(JSON.stringify(mockBloggers)),
  topics: JSON.parse(JSON.stringify(mockTopics)),
  archiveEntries: buildInitialArchive(),
  ideas: [],
  anchors: [],
  chatMessages: [],
  aiCards: [],
  readerChat: [],
};

/** 工具：sleep */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 工具：生成随机 ID */
export function makeId(prefix: string) {
  return `${prefix}_${nanoid(8)}`;
}
