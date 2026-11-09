/** The hiring pipeline. A pure state machine shared by every status change. */
export const STAGES = ['applied', 'reviewing', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'] as const;
export type Stage = (typeof STAGES)[number];

const NEXT: Record<Stage, Stage[]> = {
  applied: ['reviewing', 'rejected'],
  reviewing: ['shortlisted', 'rejected'],
  shortlisted: ['interview', 'rejected'],
  interview: ['offer', 'rejected'],
  offer: ['hired', 'rejected'],
  hired: [],
  rejected: [],
  withdrawn: [],
};

export const nextStages = (stage: Stage) => NEXT[stage];
export const isFinal = (stage: Stage) => NEXT[stage].length === 0;
export const canMove = (from: Stage, to: Stage) => NEXT[from].includes(to);
export const canWithdraw = (stage: Stage) => !isFinal(stage);

export const STAGE_MESSAGES: Partial<Record<Stage, string>> = {
  reviewing: 'The employer is reviewing your application.',
  shortlisted: 'Good news: you have been shortlisted.',
  interview: 'You have moved to the interview stage.',
  offer: 'Congratulations, you have an offer.',
  hired: 'Congratulations on the new job.',
  rejected: 'The employer has decided not to move forward this time.',
};
