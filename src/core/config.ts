import type { RuleConfig } from './types.ts';

export const DEFAULT_CONFIG: RuleConfig = {
  entropy_threshold: 3.5,
  placeholders: ['your_', 'changeme', 'example', 'placeholder'],
  provisional: true,
  to_be_chosen_on: 'dev',
};

/** Parse config text supplied by an I/O adapter; the pure core never opens a file. */
export function parseConfig(text: string): RuleConfig {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object') throw new Error('invalid_rule_config');
  const item = value as Record<string, unknown>;
  if (typeof item.entropy_threshold !== 'number' || !Number.isFinite(item.entropy_threshold) || item.entropy_threshold < 0 || item.entropy_threshold > 8 ||
      !Array.isArray(item.placeholders) || !item.placeholders.every((v: unknown) => typeof v === 'string') ||
      typeof item.provisional !== 'boolean' || typeof item.to_be_chosen_on !== 'string') throw new Error('invalid_rule_config');
  return { entropy_threshold: item.entropy_threshold, placeholders: item.placeholders as string[], provisional: item.provisional, to_be_chosen_on: item.to_be_chosen_on };
}
