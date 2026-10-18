import { NextResponse } from 'next/server';
import { getVaultStatus } from '../../utils/vault';

// Whether the configured campaign can be opened. The folder path stays on the server.
export async function GET() {
  const status = getVaultStatus();
  if (!status.ok) {
    return NextResponse.json({ ok: false, problem: status.problem, message: status.message });
  }
  return NextResponse.json({ ok: true, vaultFormat: status.vaultFormat, warning: status.warning });
}
