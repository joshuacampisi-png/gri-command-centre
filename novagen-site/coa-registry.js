/* Novagen — registered COA registry.
 * Source of truth for COA verification lookups. Each entry is keyed by its
 * verification key (canonical form: uppercase, hyphen-separated).
 *
 * To register another COA: add an object below with the same shape and drop the
 * certificate image in assets/. (For a private/large registry, move this lookup
 * behind a server route — the verify page only needs the same JSON shape back.)
 */
window.COA_REGISTRY = {
  "NGL-2026-KG24RP": {
    verificationKey: "NGL-2026-KG24RP",
    caseNumber: "17508",
    status: "Verified",
    lab: "Novagen Analytical Labs",
    labAddress: "875 Innovation Drive, Cambridge, MA 02139, USA",
    client: "NovaPeptides Australia",
    manufacturer: "BioStack",
    compound: "Retatrutide",
    cas: "2381089-83-2",
    batch: "RETA69919",
    manufacturingDate: "2026-05-30",
    expiryDate: "2029-06-14",
    netContent: "5 mg – 100 mg per vial",
    storage: "Store at 2–8°C, protected from light and moisture",
    appearance: "White to off-white lyophilized powder",
    molecularFormula: "C221H342N46O68 / ~4731 g/mol",
    results: [
      { item: "Identification", spec: "Conforms", result: "Conforms", method: "LC-MS", pass: true },
      { item: "Purity (HPLC)", spec: "≥98.0%", result: "98.28%", method: "HPLC", pass: true },
      { item: "Appearance", spec: "White to off-white lyophilized powder", result: "Conforms", method: "Visual", pass: true },
      { item: "Water Content", spec: "≤3.0%", result: "1.0%", method: "Karl Fischer", pass: true },
      { item: "Heavy Metals", spec: "≤10 ppm", result: "<10 ppm", method: "ICP-MS", pass: true },
      { item: "Endotoxin", spec: "<10 EU/mg", result: "<10 EU/mg", method: "LAL Test", pass: true }
    ],
    purity: "98.28%",
    tester: "Dr. Michael Carter",
    testDate: "2026-06-14",
    image: "assets/coa-NGL-2026-KG24RP.png",
    note: "For laboratory research use only. Not for human consumption."
  }
};
