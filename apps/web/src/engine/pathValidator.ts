const commandPattern = /^[AaCcHhLlMmQqSsTtVvZz]$/
const tokenPattern = /[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g

const parameterCount: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
}

const isCommand = (token: string): boolean => commandPattern.test(token)

export const isValidPathData = (data: string): boolean => {
  const tokens = data.match(tokenPattern)
  if (!tokens?.length) {
    return false
  }
  const remainder = data.replace(tokenPattern, '').replace(/[\s,]/g, '')
  if (remainder.length > 0 || tokens[0]?.toUpperCase() !== 'M') {
    return false
  }

  let index = 0
  let command = ''
  while (index < tokens.length) {
    const token = tokens[index]
    if (!token) {
      return false
    }
    if (isCommand(token)) {
      command = token
      index += 1
    } else if (!command) {
      return false
    }

    const normalized = command.toUpperCase()
    const count = parameterCount[normalized]
    if (count === undefined) {
      return false
    }
    if (normalized === 'Z') {
      command = ''
      continue
    }
    if (index + count > tokens.length) {
      return false
    }

    for (let offset = 0; offset < count; offset += 1) {
      const value = tokens[index + offset]
      if (!value || isCommand(value) || !Number.isFinite(Number(value))) {
        return false
      }
    }
    if (normalized === 'A') {
      const largeArc = Number(tokens[index + 3])
      const sweep = Number(tokens[index + 4])
      if ((largeArc !== 0 && largeArc !== 1) || (sweep !== 0 && sweep !== 1)) {
        return false
      }
    }

    index += count
    if (normalized === 'M') {
      command = command === 'm' ? 'l' : 'L'
    }
  }

  return true
}
