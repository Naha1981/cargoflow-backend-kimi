import { parseKimiJson, SystemPrompts } from "./ai";

describe("AI client", () => {
  it("should parse valid JSON from Kimi response", () => {
    const json = JSON.stringify({ docType: "Bill of Lading", category: "logistics", confidence: 0.95 });
    const parsed = parseKimiJson(json);
    expect(parsed.data.docType).toBe("Bill of Lading");
    expect(parsed.confidence).toBe(0.95);
  });

  it("should strip markdown fences", () => {
    const json = "```json\n{\"confidence\":0.8}\n```";
    const parsed = parseKimiJson(json);
    expect(parsed.data.confidence).toBe(0.8);
  });

  it("should handle invalid JSON gracefully", () => {
    const parsed = parseKimiJson("not json");
    expect(parsed.data.extractError).toBe(true);
  });

  it("should have all system prompts defined", () => {
    expect(SystemPrompts.classification).toBeTruthy();
    expect(SystemPrompts.extractionLogistics).toBeTruthy();
    expect(SystemPrompts.extractionMining).toBeTruthy();
    expect(SystemPrompts.extractionOil).toBeTruthy();
    expect(SystemPrompts.compliance).toBeTruthy();
    expect(SystemPrompts.costCalculation).toBeTruthy();
    expect(SystemPrompts.riskDetection).toBeTruthy();
    expect(SystemPrompts.executiveSummary).toBeTruthy();
  });
});
