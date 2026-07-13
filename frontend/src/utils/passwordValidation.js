const passwordTypeRules = [
  ['大写字母', /\p{Lu}/u],
  ['小写字母', /\p{Ll}/u],
  ['数字', /\p{Nd}/u],
  ['特殊字符', /[^\p{L}\p{N}]/u],
]

export function passwordValidationMessage(password, { emptyMessage = '请输入密码' } = {}) {
  if (!password) return emptyMessage

  const byteLength = new TextEncoder().encode(password).length
  const messages = []
  if (byteLength < 12) messages.push(`长度还差 ${12 - byteLength} 个字符`)
  if (byteLength > 72) messages.push(`长度超过上限 ${byteLength - 72} 个字符`)

  const missingTypes = passwordTypeRules.filter(([, pattern]) => !pattern.test(password)).map(([label]) => label)
  const requiredTypeCount = Math.max(0, missingTypes.length - 1)
  if (requiredTypeCount > 0) {
    messages.push(`还需从以下类型中至少选择 ${requiredTypeCount} 种：${missingTypes.join('、')}`)
  }
  return messages.join('；')
}
