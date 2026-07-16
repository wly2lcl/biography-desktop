export function shouldStreamScenarioText(
  isStreaming: boolean,
  isQaStreaming: boolean
): boolean {
  return isStreaming && !isQaStreaming;
}
