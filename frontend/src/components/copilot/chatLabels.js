export const BASE_LABELS = {
  stopGenerating: '停止生成',
  regenerateResponse: '重新生成',
  copyToClipboard: '复制到剪贴板',
  thumbsUp: '有帮助',
  thumbsDown: '没帮助',
  copied: '已复制！',
  error: '出现错误，请重试',
}

export const PAPER_LABELS = {
  ...BASE_LABELS,
  title: 'AI 分析',
  placeholder: '输入问题... (关于这篇论文)',
}

export const GLOBAL_LABELS = {
  ...BASE_LABELS,
  title: '研究助手',
  placeholder: '输入问题...',
}

export const WORKFLOW_LABELS = {
  ...BASE_LABELS,
  title: '工作流对话',
}

export const ASSISTANT_LABELS = {
  ...BASE_LABELS,
  title: 'AI 研究助手',
  placeholder: '输入消息，AI 助手会自动调用工具查询数据库...',
}
