export const formatDuration = (milliseconds: number): string => {
  if (milliseconds < 1) {
    return '<1 ms'
  }
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)} ms`
  }
  return `${(milliseconds / 1000).toFixed(1)} s`
}
