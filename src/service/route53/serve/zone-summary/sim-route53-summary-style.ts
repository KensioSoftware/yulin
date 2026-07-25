/**
 * Styling for the hosted-zone summary page.
 *
 * Kept inline in the page rather than served as a separate asset, so the
 * summary stays a single response with no extra routes to handle.
 */
export const simRoute53SummaryStyle = `<style>
body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5; }
h1 { font-size: 1.4rem; }
h2 { font-size: 1.1rem; margin-bottom: 0.25rem; }
table { border-collapse: collapse; margin: 0.5rem 0 1.5rem; }
th, td { border: 1px solid #ccc; padding: 0.25rem 0.75rem; text-align: left; }
th { background: #f4f4f4; }
.zone-meta { color: #555; font-size: 0.85rem; margin-top: 0; }
.empty { color: #555; }
</style>`;
