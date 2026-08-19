/**
 * Styling for the managed login pages.
 *
 * Held inline in each page. There is no asset route to serve and no second
 * request from the browser.
 *
 * The values approximate real managed login, measured from a live sign-in
 * page. A card centred on the page, a bold heading, labels above full-width
 * fields, and a full-width primary button. A close match is no aim of this.
 * Real managed login is built on Cloudscape and carries components these
 * pages have no equivalent for.
 *
 * The second submit button on a page is the one carrying `formnovalidate`,
 * and it is styled as the secondary of the two.
 */
export const simCognitoPageStyle = `<style>
body {
  margin: 0;
  min-height: 100vh;
  padding: 24px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9f9fa;
  color: #000716;
  font: 400 14px/20px "Helvetica Neue", Roboto, Arial, sans-serif;
}
main {
  box-sizing: border-box;
  width: 402px;
  max-width: 100%;
  padding: 24px;
  background: #fff;
  border: 1px solid #c6c6cd;
  border-radius: 8px;
}
h1 { margin: 0 0 16px; font-size: 24px; line-height: 30px; }
p { margin: 0 0 16px; }
p:last-child { margin-bottom: 0; }
label { display: block; margin-bottom: 4px; font-weight: 700; }
input:not([type="hidden"]) {
  box-sizing: border-box;
  width: 100%;
  padding: 5px 12px;
  border: 1px solid #7d8998;
  border-radius: 8px;
  font: inherit;
  color: #414d5c;
}
button {
  box-sizing: border-box;
  width: 100%;
  padding: 4px 20px;
  border: 2px solid #0972d3;
  border-radius: 8px;
  background: #0972d3;
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
button[formnovalidate] { background: #fff; color: #0972d3; }
a { color: #0972d3; text-decoration: none; }
a:hover { text-decoration: underline; }
.message {
  padding: 8px 12px;
  border: 1px solid #7d8998;
  border-radius: 8px;
  background: #f9f9fa;
}
</style>`;
