import { NextResponse } from 'next/server';
import { applyProposal } from '../../../../utils/studio-ai';
import { loadStep, saveStep, StepState } from '../../../../utils/studio-state';
import { readStepContent } from '../../../../utils/studio-steps';
import { getCampaignRoot } from '../../../../utils/vault';
import { BadRequest, parseStep, readJson, studioError } from '../../common';

type Context = { params: Promise<{ n: string }> };

const withDraft = (state: StepState) => ({ ...state, draft: state.draft ?? readStepContent(state.n) });

export async function GET(_request: Request, { params }: Context) {
  try {
    getCampaignRoot();
    return NextResponse.json(withDraft(loadStep(parseStep((await params).n))));
  } catch (error) {
    return studioError(error);
  }
}

// Saves the draft and the DM's decisions on proposals and inconsistencies
export async function PUT(request: Request, { params }: Context) {
  try {
    getCampaignRoot();
    const n = parseStep((await params).n);
    const body = await readJson(request);
    const state = withDraft(loadStep(n));
    if (typeof body.draft === 'string') state.draft = body.draft;
    // "Clear conversation": the chat history goes, proposals, issues and usage stay
    if (body.clearMessages === true) state.messages = [];
    if (typeof body.proposalId === 'string') {
      const proposal = state.proposals.find(p => p.id === body.proposalId);
      if (!proposal || !['accepted', 'rejected'].includes(body.proposalStatus as string)) throw new BadRequest('Unknown proposal or status.');
      proposal.status = body.proposalStatus as 'accepted' | 'rejected';
      if (proposal.status === 'accepted') state.draft = applyProposal(state.draft, proposal.section, proposal.newText);
    }
    if (typeof body.inconsistencyId === 'string') {
      const issue = state.inconsistencies.find(i => i.id === body.inconsistencyId);
      if (!issue || !['fixed', 'kept'].includes(body.inconsistencyStatus as string)) throw new BadRequest('Unknown inconsistency or status.');
      issue.status = body.inconsistencyStatus as 'fixed' | 'kept';
    }
    if (state.status === 'todo') state.status = 'in-progress';
    saveStep(state);
    return NextResponse.json(state);
  } catch (error) {
    return studioError(error);
  }
}
