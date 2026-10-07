import type { Paper } from '@/types';

/** Mock 论文数据。真实后端接入时这个文件不再使用。 */
export const mockPapers: Paper[] = [
  {
    id: 'p_001',
    title: 'Seq Fusion for Rec Systems: Dual-Path Long-Short Term Modeling',
    authors: ['Wei Chen', 'Ming Zhao', 'Jing Li'],
    arxivId: '2408.12345',
    externalUrl: 'https://arxiv.org/abs/2408.12345',
    source: 'arxiv',
    abstract:
      'We propose a dual-path sequence fusion module that jointly models long-term user preferences and real-time session intent...',
    aiSummary: '提出双路序列融合方法，兼顾长期兴趣与实时会话意图，在多个公开数据集上取得 SOTA。',
    tags: ['推荐系统', '序列建模'],
    domain: '推荐系统',
    publishedAt: '2026-08-14T00:00:00Z',
    addedAt: '2026-09-01T09:00:00Z',
    readingMinutes: 12,
    difficulty: 'medium',
    status: 'unread',
    content: `# Seq Fusion for Rec Systems

## Abstract

We propose a **dual-path sequence fusion module** that jointly models long-term user preferences and real-time session intent. The key idea is to decouple stable long-term signals from volatile short-term signals via two parallel encoders, then fuse them through a learned gating mechanism.

## 1. Introduction

Recommender systems have long struggled with the tension between long-term user preferences and short-term intent shifts. Existing methods either flatten the two into a single sequence encoder or use hand-designed heuristics to split them, both of which introduce systematic bias.

We identify two key requirements:

1. **Long-term stability**: user embeddings should not drift excessively based on a single session
2. **Short-term responsiveness**: within-session behavior must be reflected in ranking quickly

## 2. Related Work

Prior work in this space falls into three categories: (i) monolithic sequence models such as SASRec and BST, (ii) two-stage designs like SIM and TWIN which use search-based retrieval over long histories, and (iii) hybrid gating architectures.

## 3. Method

### 3.1 Architecture

Our architecture consists of a **long-term encoder** operating over user history up to 90 days, and a **short-term encoder** operating over the current session (< 30 minutes).

The two encoders share vocabulary but have independent parameters. Their outputs are fused via a gating network:

$$g = \\sigma(W_g [h_l ; h_s] + b_g)$$
$$h = g \\odot h_l + (1 - g) \\odot h_s$$

### 3.2 Training

We train with a two-stage curriculum: first pretrain each encoder independently on masked next-item prediction, then jointly fine-tune with the gating network.

## 4. Experiments

We evaluate on MovieLens-20M and a proprietary e-commerce dataset. Results show a consistent 2-4% improvement over strong baselines including SIM and TWIN.

## 5. Conclusion

Dual-path fusion offers a principled way to combine long-term and short-term signals in sequence recommendation, with practical latency benefits due to encoder decoupling.
`,
    chapters: [
      { id: 'c1', title: 'Abstract', level: 1, anchor: 'abstract' },
      { id: 'c2', title: '1. Introduction', level: 1, anchor: '1-introduction' },
      { id: 'c3', title: '2. Related Work', level: 1, anchor: '2-related-work' },
      { id: 'c4', title: '3. Method', level: 1, anchor: '3-method' },
      { id: 'c4a', title: '3.1 Architecture', level: 2, anchor: '31-architecture' },
      { id: 'c4b', title: '3.2 Training', level: 2, anchor: '32-training' },
      { id: 'c5', title: '4. Experiments', level: 1, anchor: '4-experiments' },
      { id: 'c6', title: '5. Conclusion', level: 1, anchor: '5-conclusion' },
    ],
  },
  {
    id: 'p_002',
    title: 'Long-Context Attention with Sliding Window Sparsity',
    authors: ['Alice Wang', 'Bob Kumar'],
    arxivId: '2407.99887',
    externalUrl: 'https://arxiv.org/abs/2407.99887',
    source: 'arxiv',
    bloggerIds: ['b_001'],
    abstract:
      'A sliding window attention mechanism that achieves near-linear scaling for long contexts...',
    aiSummary: '提出一种基于滑动窗口的稀疏注意力，把长文本注意力开销降到近线性。',
    tags: ['LLM', '长文本'],
    domain: '大模型',
    publishedAt: '2026-08-30T00:00:00Z',
    addedAt: '2026-09-02T10:00:00Z',
    readingMinutes: 25,
    difficulty: 'hard',
    status: 'unread',
    content: `# Long-Context Attention with Sliding Window Sparsity

## Abstract
Attention over very long sequences remains a bottleneck for LLMs...

## 1. Introduction
We introduce a sliding-window sparse attention that reduces the quadratic cost...

## 2. Method
Our sparse pattern combines local dense attention within a window and periodic global attention landmarks.

## 3. Experiments
Evaluated on PG-19, Books3, and code corpora...

## 4. Discussion
The approach scales to 128k tokens on a single A100.
`,
    chapters: [
      { id: 'c1', title: 'Abstract', level: 1, anchor: 'abstract' },
      { id: 'c2', title: '1. Introduction', level: 1, anchor: '1-introduction' },
      { id: 'c3', title: '2. Method', level: 1, anchor: '2-method' },
      { id: 'c4', title: '3. Experiments', level: 1, anchor: '3-experiments' },
      { id: 'c5', title: '4. Discussion', level: 1, anchor: '4-discussion' },
    ],
  },
  {
    id: 'p_003',
    title: 'Efficient MoE Routing via Learned Gate Priors',
    authors: ['Chen Xu', 'Diana Liu'],
    externalUrl: 'https://example.com/moe-routing',
    source: 'blogger',
    bloggerIds: ['b_002'],
    abstract:
      'We introduce a learned prior over expert routing to reduce MoE redundancy...',
    aiSummary: '通过学习路由权重先验减少 MoE 中冗余专家激活，节省 30% 算力。',
    tags: ['大模型', '效率'],
    domain: '大模型',
    publishedAt: '2026-08-27T00:00:00Z',
    addedAt: '2026-09-03T14:00:00Z',
    readingMinutes: 8,
    difficulty: 'easy',
    status: 'unread',
    content: `# Efficient MoE Routing via Learned Gate Priors

## Abstract
Mixture-of-Experts models suffer from load imbalance and redundant expert activation...

## 1. Introduction
We propose gate priors learned during training...

## 2. Method
The learned prior modulates the softmax logits before top-k selection.

## 3. Experiments
On Switch Transformer benchmarks, we save 30% FLOPs at equal quality.
`,
    chapters: [
      { id: 'c1', title: 'Abstract', level: 1, anchor: 'abstract' },
      { id: 'c2', title: '1. Introduction', level: 1, anchor: '1-introduction' },
      { id: 'c3', title: '2. Method', level: 1, anchor: '2-method' },
      { id: 'c4', title: '3. Experiments', level: 1, anchor: '3-experiments' },
    ],
  },
  {
    id: 'p_004',
    title: 'SIM: Search-based Interest Modeling for Long User Sequences',
    authors: ['Team Alibaba'],
    arxivId: '2006.05639',
    externalUrl: 'https://arxiv.org/abs/2006.05639',
    source: 'arxiv',
    abstract:
      'SIM uses a two-stage retrieval-then-attention design to model long user behavior sequences efficiently...',
    aiSummary: '两阶段检索式长序列建模：先粗筛再精排。',
    tags: ['推荐系统', '序列建模'],
    domain: '推荐系统',
    publishedAt: '2026-06-15T00:00:00Z',
    addedAt: '2026-08-15T14:00:00Z',
    readingMinutes: 15,
    difficulty: 'medium',
    status: 'archived',
  },
  {
    id: 'p_005',
    title: 'TWIN: Two-stage Interest Network with Consistency Objectives',
    authors: ['Kuaishou Team'],
    arxivId: '2302.02352',
    externalUrl: 'https://arxiv.org/abs/2302.02352',
    source: 'arxiv',
    abstract:
      'TWIN unifies the retrieval and target attention stages with a consistency loss...',
    aiSummary: 'TWIN 用一致性约束统一两阶段兴趣建模。',
    tags: ['推荐系统', '序列建模'],
    domain: '推荐系统',
    publishedAt: '2026-05-20T00:00:00Z',
    addedAt: '2026-08-18T09:00:00Z',
    readingMinutes: 18,
    difficulty: 'medium',
    status: 'archived',
  },
  {
    id: 'p_006',
    title: 'Cold-Start Recommendation via Contrastive Meta-Learning',
    authors: ['Xia Yang', 'Tian Wu'],
    arxivId: '2408.55123',
    externalUrl: 'https://arxiv.org/abs/2408.55123',
    source: 'arxiv',
    abstract:
      'A meta-learning framework tailored to cold-start item recommendation...',
    aiSummary: '用对比元学习解决冷启动物品的推荐问题。',
    tags: ['推荐系统', '冷启动'],
    domain: '推荐系统',
    publishedAt: '2026-08-05T00:00:00Z',
    addedAt: '2026-08-25T11:00:00Z',
    readingMinutes: 20,
    difficulty: 'hard',
    status: 'done',
  },
  {
    id: 'p_007',
    title: 'Sparse Mixture-of-Experts for Multi-Task Learning',
    authors: ['Meta AI'],
    arxivId: '2311.03214',
    externalUrl: 'https://arxiv.org/abs/2311.03214',
    source: 'arxiv',
    bloggerIds: ['b_001'],
    abstract:
      'A sparse MoE approach that partitions tasks across specialized experts...',
    aiSummary: '稀疏 MoE 通过专家分工提升多任务学习效果。',
    tags: ['大模型', 'MoE'],
    domain: '大模型',
    publishedAt: '2026-07-11T00:00:00Z',
    addedAt: '2026-08-20T15:00:00Z',
    readingMinutes: 22,
    difficulty: 'hard',
    status: 'archived',
  },
  {
    id: 'p_008',
    title: 'RLHF at Scale: Lessons from Training Preference Models',
    authors: ['OpenResearch'],
    arxivId: '2409.11122',
    externalUrl: 'https://arxiv.org/abs/2409.11122',
    source: 'arxiv',
    abstract:
      'Practical lessons from training preference models at billion-parameter scale...',
    aiSummary: '大规模训练偏好模型的工程经验总结。',
    tags: ['大模型', 'RLHF'],
    domain: '大模型',
    publishedAt: '2026-09-01T00:00:00Z',
    addedAt: '2026-09-02T18:00:00Z',
    readingMinutes: 30,
    difficulty: 'hard',
    status: 'unread',
  },
  {
    id: 'p_009',
    title: 'Efficient Fine-Tuning with LoRA and Its Variants',
    authors: ['Research Lab'],
    externalUrl: 'https://example.com/lora-review',
    source: 'blogger',
    bloggerIds: ['b_003'],
    abstract: 'A systematic review of LoRA and its recent variants...',
    aiSummary: 'LoRA 及其变体（QLoRA/DoRA 等）的系统性综述。',
    tags: ['大模型', '微调'],
    domain: '大模型',
    publishedAt: '2026-08-22T00:00:00Z',
    addedAt: '2026-09-04T12:00:00Z',
    readingMinutes: 15,
    difficulty: 'easy',
    status: 'unread',
  },
  {
    id: 'p_010',
    title: 'Multi-Objective Learning for Ranking with Pareto-Efficient Losses',
    authors: ['Zhang Wei'],
    arxivId: '2405.98765',
    externalUrl: 'https://arxiv.org/abs/2405.98765',
    source: 'arxiv',
    abstract:
      'A Pareto-efficient loss formulation for multi-objective ranking...',
    aiSummary: '推荐排序多目标学习中的 Pareto 高效损失设计。',
    tags: ['推荐系统', '多目标'],
    domain: '推荐系统',
    publishedAt: '2026-05-30T00:00:00Z',
    addedAt: '2026-08-10T09:00:00Z',
    readingMinutes: 14,
    difficulty: 'medium',
    status: 'archived',
  },
  {
    id: 'p_011',
    title: 'Session-based Recommendation with Graph Neural Networks',
    authors: ['Li Ming', 'Wang Fei'],
    arxivId: '2403.11223',
    externalUrl: 'https://arxiv.org/abs/2403.11223',
    source: 'arxiv',
    abstract: 'Session-based recommendation via graph neural networks...',
    aiSummary: '会话级推荐通过图神经网络建模物品转移关系。',
    tags: ['推荐系统', '图神经网络'],
    domain: '推荐系统',
    publishedAt: '2026-03-15T00:00:00Z',
    addedAt: '2026-07-25T10:00:00Z',
    readingMinutes: 18,
    difficulty: 'medium',
    status: 'archived',
  },
  {
    id: 'p_012',
    title: 'Attention Is All You Need for Extremely Long Contexts',
    authors: ['MIT CSAIL'],
    arxivId: '2408.22233',
    externalUrl: 'https://arxiv.org/abs/2408.22233',
    source: 'arxiv',
    abstract: 'Rethinking attention for 1M+ token contexts...',
    aiSummary: '重新思考百万 token 上下文下的注意力机制。',
    tags: ['LLM', '长文本'],
    domain: '大模型',
    publishedAt: '2026-08-01T00:00:00Z',
    addedAt: '2026-08-28T14:00:00Z',
    readingMinutes: 28,
    difficulty: 'hard',
    status: 'unread',
  },
];
