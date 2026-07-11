export const BASE_LABELS = {
  chatInputPlaceholder: '输入消息…',
  chatInputToolbarStartTranscribeButtonLabel: '开始语音输入',
  chatInputToolbarCancelTranscribeButtonLabel: '取消语音输入',
  chatInputToolbarFinishTranscribeButtonLabel: '完成语音输入',
  chatInputToolbarAddButtonLabel: '添加附件',
  chatInputToolbarToolsButtonLabel: '工具',
  assistantMessageToolbarCopyCodeLabel: '复制代码',
  assistantMessageToolbarCopyCodeCopiedLabel: '已复制',
  assistantMessageToolbarCopyMessageLabel: '复制消息',
  assistantMessageToolbarThumbsUpLabel: '有帮助',
  assistantMessageToolbarThumbsDownLabel: '没帮助',
  assistantMessageToolbarReadAloudLabel: '朗读',
  assistantMessageToolbarRegenerateLabel: '重新生成',
  userMessageToolbarCopyMessageLabel: '复制消息',
  userMessageToolbarEditMessageLabel: '编辑消息',
  chatDisclaimerText: 'AI 生成内容可能有误，请核对重要信息。',
  chatToggleOpenLabel: '打开研究助手',
  chatToggleCloseLabel: '关闭研究助手',
  modalHeaderTitle: '研究助手',
}

export const PAPER_LABELS = {
  ...BASE_LABELS,
  modalHeaderTitle: 'AI 论文助手',
  chatInputPlaceholder: '输入关于这篇论文的问题…',
}

export const GLOBAL_LABELS = {
  ...BASE_LABELS,
  modalHeaderTitle: '研究助手',
  chatInputPlaceholder: '输入研究问题…',
  welcomeMessageText: '你好！我可以帮你搜索论文、分析研究趋势和管理文献。',
}

export const WORKFLOW_LABELS = {
  ...BASE_LABELS,
  modalHeaderTitle: '工作流对话',
  welcomeMessageText: '这里的对话只属于当前科研工作流。',
}

export const ASSISTANT_LABELS = {
  ...BASE_LABELS,
  modalHeaderTitle: 'AI 研究助手',
  chatInputPlaceholder: '输入消息，AI 助手会按需调用工具查询数据库…',
  welcomeMessageText: '你好！我是你的论文研究助手，可以搜索论文、分析趋势和管理文献。',
}
