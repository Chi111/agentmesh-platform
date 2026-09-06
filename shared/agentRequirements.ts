/** Explicit requirements match advertised categories/tags, never inferred ability. */
export function parseRequiredCapabilities(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20 || value.some((item) => (
    typeof item !== 'string' || !item.trim() || item.length > 80
  ))) return null;
  return [...new Set(value.map((item: string) => item.trim().toLowerCase()))];
}

export function meetsRequiredCapabilities(
  agent: { category: string; tags: string[] },
  required: unknown,
): boolean {
  const capabilities = parseRequiredCapabilities(required);
  if (capabilities === null) return false;
  const advertised = new Set([agent.category, ...agent.tags].map((value) => value.trim().toLowerCase()));
  return capabilities.every((capability) => advertised.has(capability));
}
