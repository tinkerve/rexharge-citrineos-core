export const TableName = {
  SecurityEvents: 'SecurityEvents',
} as const;

export type TableName = (typeof TableName)[keyof typeof TableName];
