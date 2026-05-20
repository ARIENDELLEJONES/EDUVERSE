/** Build POST body for /grades/weights from DB-shaped or mixed state. */
export function weightsToApiPayload(databaseId, weights = {}) {
  return {
    databaseId,
    midtermCollective: Number(weights.midterm_collective ?? weights.midtermCollective ?? 0),
    finalInitial: Number(weights.final_initial ?? weights.finalInitial ?? 0),
    finalFinal: Number(weights.final_final ?? weights.finalFinal ?? 0),
    midtermExam: Number(weights.midterm_exam ?? weights.midtermExam ?? 0),
    finalExam: Number(weights.final_exam ?? weights.finalExam ?? 0),
    passMidterm: Number(weights.pass_midterm ?? weights.passMidterm ?? 0),
    passInitial: Number(weights.pass_initial ?? weights.passInitial ?? 0),
    passFinal: Number(weights.pass_final ?? weights.passFinal ?? 0),
    passOverall: Number(weights.pass_overall ?? weights.passOverall ?? 0),
    freezeFinal: Boolean(weights.freeze_final ?? weights.freezeFinal ?? false),
    customFormula: String(weights.custom_formula ?? weights.customFormula ?? '')
  };
}
