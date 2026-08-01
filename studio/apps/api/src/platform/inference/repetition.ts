const repeatedSuffixStart = (value: string, windowSize = 240): number => {
  const suffixStart = value.length - windowSize
  if (suffixStart < windowSize) return -1
  const suffix = value.slice(suffixStart)
  const previousStart = value.lastIndexOf(suffix, suffixStart - windowSize)
  if (previousStart < 0) return -1
  let repeatedStart = suffixStart
  let earlierStart = previousStart
  while (earlierStart > 0 && repeatedStart > 0 && value[earlierStart - 1] === value[repeatedStart - 1]) {
    earlierStart--
    repeatedStart--
  }
  return repeatedStart
}

export function trimRepeatedSuffix(value: string): { content: string; stopped: boolean } {
  let content = value
  let stopped = false
  for (let iteration = 0; iteration < 64; iteration++) {
    const start = repeatedSuffixStart(content)
    if (start < 0) break
    content = content.slice(0, start).trimEnd()
    stopped = true
  }
  return { content, stopped }
}
