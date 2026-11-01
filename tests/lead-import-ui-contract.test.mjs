import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../site/comverxa-premium-operacional.html",import.meta.url),"utf8");
const js=readFileSync(new URL("../site/comverxa-premium-operacional.js",import.meta.url),"utf8");
test("lead importer provides real controls and handlers",()=>{
 for(const name of ["leadImportFile","leadPasteOpen","leadPasteText","leadPreviewBtn","leadImportConfirm","leadImportStatus","leadImportPreview"]){
  assert.match(html,new RegExp('id="'+name+'"'));
  assert.ok(js.includes('$("'+name+'")'),"missing import handler for "+name);
 }
 assert.ok(js.includes('function parseImportedLeads('));
 assert.ok(js.includes('"/api/commercial/leads/import"'));
 assert.ok(js.includes('await loadLeads()'));
});
