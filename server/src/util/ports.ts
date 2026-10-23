export function parsePort(text: string | undefined): number | undefined {
  const port = Number(text);
  return text !== undefined && Number.isInteger(port) && port > 0 && port < 65_536 ? port : undefined;
}
