// Shown instead of the dashboard when no campaign can be opened, or when the DM
// picks "Manage campaigns…" in the dashboard.

import CampaignPicker from './CampaignPicker';
import type { CampaignsInfo } from '../utils/campaigns';

const TEMPLATE_URL = 'https://github.com/tzoorlee/DM-Second-Brain';

interface VaultSetupProps {
  problem?: string;
  message?: string;
  campaigns: CampaignsInfo | null;
  // Set when opened from the dashboard
  onBack?: () => void;
}

export default function VaultSetup({ problem, message, campaigns, onBack }: VaultSetupProps) {
  const needsAppUpdate = problem === 'unsupported-format';
  const templateLink = <a href={TEMPLATE_URL} target="_blank" rel="noreferrer">DM-Second-Brain template</a>;
  const updateText = (
    <p>
      This campaign was made with a newer version of the {templateLink}.
      To keep its secrets safe, the app won&apos;t read it until it supports that format.
      Pull the latest version of the app and restart it.
    </p>
  );

  if (campaigns?.mode === 'campaigns-dir') {
    return (
      <main className="setup-screen">
        <div className="setup-card glass animate-fade-in">
          <div className="setup-heading">
            <h1>Campaigns</h1>
            {onBack && (
              <button type="button" className="secondary" onClick={onBack}>
                Back to the dashboard
              </button>
            )}
          </div>
          {message && (problem === 'no-active-campaign' ? <p>{message}</p> : <div className="setup-problem" role="alert">{message}</div>)}
          {needsAppUpdate && updateText}
          {problem === 'campaigns-dir-not-found' ? (
            <p>Create that folder, or fix <code>CAMPAIGNS_DIR</code> in <code>.env.local</code>, then reload this page.</p>
          ) : (
            <CampaignPicker info={campaigns} />
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="setup-screen">
      <div className="setup-card glass animate-fade-in">
        <h1>{needsAppUpdate ? 'Update the app' : 'Open a campaign'}</h1>
        {message && <div className="setup-problem" role="alert">{message}</div>}

        {needsAppUpdate ? (
          updateText
        ) : (
          <>
            <p>
              The app reads campaign folders (<em>vaults</em>) made from the {templateLink}:
              folders that hold <code>wiki/</code> and <code>raw/</code>.
            </p>
            <ol>
              <li>
                In the app folder, copy <code>.env.example</code> to <code>.env.local</code>.
              </li>
              <li>
                Set <code>CAMPAIGNS_DIR</code> to the folder that holds your campaigns, one subfolder each.
                It can be empty: you&apos;ll create campaigns from here.
                <pre>CAMPAIGNS_DIR=~/campaigns</pre>
                Or open a single campaign folder with <code>VAULT_PATH</code> instead:
                <pre>VAULT_PATH=../my-campaign</pre>
                Paths are absolute, relative to the app folder, or start with <code>~/</code>.
              </li>
              <li>
                Restart the app (<code>pnpm dev</code>) and reload this page.
              </li>
            </ol>
            <p style={{ fontSize: '13px' }}>
              Want to look around first? Try the template&apos;s bundled example in{' '}
              <code>examples/silverbrook-campaign</code>.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
