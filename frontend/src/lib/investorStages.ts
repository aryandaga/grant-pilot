import type { InvestorStage } from '../api/investors';

export const DEFAULT_INVESTOR_STAGES: InvestorStage[] = [
  { key: 'cold', label: 'Cold', short_label: 'Cold', order: 0 },
  { key: 'initial', label: 'Initial', short_label: 'Initial', order: 1 },
  { key: 'proposal', label: 'Proposal', short_label: 'Proposal', order: 2 },
  { key: 'visit_campus', label: 'Visit Campus', short_label: 'Campus Visit', order: 3 },
  { key: 'verbal_commitment', label: 'Verbal Commitment', short_label: 'Verbal Commit', order: 4 },
  { key: 'mou', label: 'MOU', short_label: 'MOU', order: 5 },
  { key: 'draw_down_1', label: 'Draw Down 1', short_label: 'DD1', order: 6 },
  { key: 'draw_down_2', label: 'Draw Down 2', short_label: 'DD2', order: 7 },
  { key: 'draw_down_3', label: 'Draw Down 3', short_label: 'DD3', order: 8 },
  { key: 'draw_down_4', label: 'Draw Down 4', short_label: 'DD4', order: 9 },
];

export function sortStages(stages: InvestorStage[]): InvestorStage[] {
  return [...stages].sort((a, b) => a.order - b.order);
}

export function getStageKey(stages: InvestorStage[], stage: string | null | undefined): string {
  return stages.some((item) => item.key === stage) ? String(stage) : stages[0]?.key ?? 'cold';
}

export function getStageLabel(stages: InvestorStage[], stage: string | null | undefined): string {
  const safeKey = getStageKey(stages, stage);
  return stages.find((item) => item.key === safeKey)?.label ?? 'Cold';
}
