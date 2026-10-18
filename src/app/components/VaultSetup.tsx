// Shown instead of the dashboard when the configured campaign can't be opened.

const TEMPLATE_URL = 'https://github.com/tzoorlee/DM-Second-Brain';

interface VaultSetupProps {
  problem: string;
  message: string;
}

export default function VaultSetup({ problem, message }: VaultSetupProps) {
  const needsAppUpdate = problem === 'unsupported-format';

  return (
    <main className="setup-screen">
      <div className="setup-card glass animate-fade-in">
        <h1>{needsAppUpdate ? 'Update the app' : 'Open a campaign'}</h1>
        <div className="setup-problem" role="alert">{message}</div>

        {needsAppUpdate ? (
          <p>
            This campaign was made with a newer version of the{' '}
            <a href={TEMPLATE_URL} target="_blank" rel="noreferrer">DM-Second-Brain template</a>.
            To keep its secrets safe, the app won&apos;t read it until it supports that format.
            Pull the latest version of the app and restart it.
          </p>
        ) : (
          <>
            <p>
              The app reads a campaign folder (a <em>vault</em>) made from the{' '}
              <a href={TEMPLATE_URL} target="_blank" rel="noreferrer">DM-Second-Brain template</a>:
              the folder that holds <code>wiki/</code> and <code>raw/</code>.
            </p>
            <ol>
              <li>
                In the app folder, copy <code>.env.example</code> to <code>.env.local</code>.
              </li>
              <li>
                Set <code>VAULT_PATH</code> to your campaign folder, absolute or relative to the app folder:
                <pre>VAULT_PATH=../my-campaign</pre>
              </li>
              <li>
                Restart the app (<code>pnpm dev</code>) and reload this page.
              </li>
            </ol>
            <p style={{ fontSize: '13px' }}>
              No campaign yet? Create one from the template, or try its bundled example in{' '}
              <code>examples/silverbrook-campaign</code>.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
