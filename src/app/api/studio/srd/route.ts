import { NextResponse } from 'next/server';
import { downloadSrd, setNoSrd } from '../../../utils/srd';
import { loadStep, saveStep } from '../../../utils/studio-state';
import { getCampaignRoot } from '../../../utils/vault';
import { BadRequest, readJson, studioError } from '../common';

// Step 6: download an SRD edition, or record that the table uses none
export async function POST(request: Request) {
  try {
    getCampaignRoot();
    const { edition } = await readJson(request);
    let files = 0;
    if (edition === 'none') setNoSrd();
    else if (edition === '5.1' || edition === '5.2.1') files = (await downloadSrd(edition)).files;
    else throw new BadRequest('Choose 5.1, 5.2.1 or none.');
    saveStep({ ...loadStep(6), status: 'approved' });
    return NextResponse.json({ files });
  } catch (error) {
    return studioError(error);
  }
}
