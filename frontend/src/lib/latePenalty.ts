// ============================================================
// COMMIT PLATFORM — Late Penalty Calculator
// frontend/src/lib/latePenalty.ts
// ============================================================

export interface PenaltySettings {
  lateSubmissionsAllowed: boolean
  penaltyPerDay: number   // points deducted per day late
  penaltyMax: number      // maximum total deduction (0 = no max)
}

export interface PenaltyResult {
  rawGrade: number
  daysLate: number
  penaltyApplied: number
  finalGrade: number
  isLate: boolean
}

/**
 * Calculates the penalized grade given a raw grade,
 * submission time, due date, and penalty settings.
 */
export function calculatePenalty(
  rawGrade: number,
  submittedAt: string | null,
  dueDate: string | null,
  settings: PenaltySettings,
): PenaltyResult {
  const isLate = !!(submittedAt && dueDate && new Date(submittedAt) > new Date(dueDate))

  if (!isLate || settings.penaltyPerDay === 0) {
    return {
      rawGrade,
      daysLate: 0,
      penaltyApplied: 0,
      finalGrade: rawGrade,
      isLate,
    }
  }

  const submitted = new Date(submittedAt!)
  const due = new Date(dueDate!)
  const diffMs = submitted.getTime() - due.getTime()
  const daysLate = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  let penalty = daysLate * settings.penaltyPerDay

  // Apply max cap if set
  if (settings.penaltyMax > 0) {
    penalty = Math.min(penalty, settings.penaltyMax)
  }

  const finalGrade = Math.max(0, rawGrade - penalty)

  return {
    rawGrade,
    daysLate,
    penaltyApplied: penalty,
    finalGrade,
    isLate,
  }
}

/**
 * Returns the effective penalty settings for an assignment,
 * merging classroom defaults with per-assignment overrides.
 */
export function effectivePenaltySettings(
  classroomSettings: Partial<PenaltySettings>,
  assignmentOverrides: Partial<PenaltySettings> | null,
): PenaltySettings {
  const defaults: PenaltySettings = {
    lateSubmissionsAllowed: true,
    penaltyPerDay: 0,
    penaltyMax: 0,
  }

  const classroom: PenaltySettings = {
    lateSubmissionsAllowed: classroomSettings.lateSubmissionsAllowed ?? defaults.lateSubmissionsAllowed,
    penaltyPerDay: classroomSettings.penaltyPerDay ?? defaults.penaltyPerDay,
    penaltyMax: classroomSettings.penaltyMax ?? defaults.penaltyMax,
  }

  if (!assignmentOverrides) return classroom

  return {
    lateSubmissionsAllowed: assignmentOverrides.lateSubmissionsAllowed ?? classroom.lateSubmissionsAllowed,
    penaltyPerDay: assignmentOverrides.penaltyPerDay ?? classroom.penaltyPerDay,
    penaltyMax: assignmentOverrides.penaltyMax ?? classroom.penaltyMax,
  }
}