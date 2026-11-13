# Prompt Vault

Source for the existing Netlify frontend and Google Apps Script Owner dashboard. Google Sheets remains the content store. No paid AI API is used.

Public catalogue contents are returned only after the published feed has been verified by the server. Public HTML contains no embedded prompt archive. When the feed cannot be checked, the interface clears prompt results instead of falling back to withdrawn source content.

Internal Apps Script functions end in an underscore so `google.script.run` cannot invoke helpers that access sheets, configuration or authentication internals. Owner RPCs continue to verify the session.

`public/` contains the frontend. `netlify/functions/updates.mjs` filters the source catalogue using approved Google Sheets changes. `src/` contains Apps Script server files, the server catalogue, Index and Admin. `tests/` contains executable local checks. The retained source archive has 10,003 unique prompt IDs; source preservation does not mean that AI outputs were editorially verified.

The existing GitHub workflow is completed with actual Apps Script sources. It verifies the deployment ID before pushing and updates the same deployment URL. Optional existing Netlify deployment credentials are used only if both token and project ID are configured. Runtime authentication values never belong in this repository.

Run the Node suites in `.github/workflows/deploy.yml` for logic validation. A passing local suite does not establish a successful production deployment. Use the actual workflow result and live endpoint checks as evidence of publication.
