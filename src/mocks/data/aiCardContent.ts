/**
 * AI 卡片和 Chat 的 Mock 内容库
 */
import type { AICardType } from '@shared/schemas/paper';

const cardContent: Record<
  AICardType,
  { title: string; content: string }
> = {
  motivation: {
    title: '🎯 Motivation',
    content:
      '现有推荐系统的序列建模方法在处理长期兴趣与实时会话意图时存在明显的 trade-off：单塔模型会让实时兴趣被长期兴趣稀释，而两塔模型又难以捕捉跨时间尺度的关联。这篇工作希望在保证低延迟的前提下，让模型同时兼顾用户的稳定偏好与瞬时意图。',
  },
  method: {
    title: '🛠 Method',
    content:
      '核心设计是双路序列编码器 + 门控融合。长期塔负责建模 90 天历史行为，采用 SASRec 风格的自注意力；短期塔只处理当前 session（<30 分钟）内的行为序列。两塔输出通过一个可学习的门控网络 g = σ(W[h_l; h_s] + b) 融合，g 值动态决定长短期信号在最终表征中的权重。训练用两阶段课程：先分别预训练两塔，再联合微调门控。',
  },
  experiments: {
    title: '🧪 Experiments',
    content:
      '在 MovieLens-20M 和一份工业电商数据集上评测。相较 SIM 和 TWIN 等强 baseline，AUC 提升 2.4%~3.8%，长尾用户提升更明显（+5.1%）。消融实验显示门控网络贡献了约一半提升，其余来自双塔独立预训练。在线部署延迟 47ms（对比原基线 42ms），可接受。',
  },
  limitations: {
    title: '⚠️ Limitations',
    content:
      '1）短期塔在冷启动用户（<3 次行为）上表现退化，需要冷启动专用策略；2）门控网络的输入为长短期塔的拼接向量，特征维度膨胀导致门控层参数量增加约 15%；3）训练两阶段流程增加了系统复杂度，工业界部署 pipeline 需要重新设计。',
  },
  transferable: {
    title: '💡 可迁移点',
    content:
      '双路 + 门控的架构可以直接迁移到：a) 精排模型中区分长短期序列特征；b) LLM 推荐场景做多时间尺度上下文融合；c) 广告排序系统的时序特征分组。关键是"独立编码 + 学习门控"的思路，可复用性很强。',
  },
};

export function getMockCardContent(type: AICardType) {
  return cardContent[type];
}

/** Chat 通用回复模板 */
export function generateChatReply(userQuestion: string): string {
  const lower = userQuestion.toLowerCase();
  if (lower.includes('sim') || lower.includes('twin')) {
    return '这个门控机制和 SIM 的核心区别在于：SIM 是先做检索再做 target attention，本质上是"降低计算量"的思路；本文的门控是直接决定长短期表征的权重比例，是"平衡信号强度"的思路。你可以把 SIM 理解为空间维度的截断，而这里是特征维度的加权。';
  }
  if (lower.includes('延迟') || lower.includes('latency')) {
    return '论文里报告的在线延迟是 47ms，相比 baseline 增加约 12%。主要开销在门控层的 MLP，如果你的场景对延迟敏感，可以考虑：a) 用固定门控（预先训练一个全局最优的 g）；b) 门控层剪枝；c) 只在候选池 top-K 上做门控。';
  }
  if (lower.includes('冷启动') || lower.includes('cold')) {
    return '冷启动确实是这个方法的软肋。作者在附录 A.3 提到，用户行为 <3 次时短期塔的输出接近噪声。他们的处理是：如果短期塔的置信度（一个额外的头）低于阈值，就退化为只用长期塔。你的场景如果冷启动占比高，可能需要考虑基于内容的补充信号。';
  }
  return '这是一个好问题。基于论文内容，我的理解是：作者的核心贡献在于给出了一种"低成本兼顾长短期"的架构选择。它的适用前提是你的用户已经有相对丰富的长期行为数据，且业务场景对实时性有较高要求。如果你想深入某个具体点，可以告诉我。';
}
