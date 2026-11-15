/*
 * Fantasy scoring rules — pure functions, no database. Mirrored in Frontend/src/app/scoring.ts.
 *
 *   Race        25-18-15-12-10-8-6-4-2-1, +5 fastest lap (top-10 finish only), DNF = 0
 *   Sprint      8-7-6-5-4-3-2-1
 *   Qualifying  P1 10 … P10 1
 *   Prediction  exact finishing position +5, within one place +2
 *   Captain     that driver's points ×2 (prediction bonus not doubled)
 *   Constructor sum of its drivers' race + sprint + qualifying points
 */

export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1]
export const QUALI_POINTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
export const FASTEST_LAP_BONUS = 5
export const FASTEST_LAP_MAX_POSITION = 10
export const PREDICTION_EXACT_BONUS = 5
export const PREDICTION_CLOSE_BONUS = 2
export const CAPTAIN_MULTIPLIER = 2

const pointsFor = (table, position) => (position >= 1 && position <= table.length ? table[position - 1] : 0)

export const racePoints = (r) => {
    if (!r || r.dnf || !r.finishPosition) return 0
    const fl = r.fastestLap && r.finishPosition <= FASTEST_LAP_MAX_POSITION ? FASTEST_LAP_BONUS : 0
    return pointsFor(RACE_POINTS, r.finishPosition) + fl
}

export const sprintPoints = (r) => (!r || r.sprintDnf || !r.sprintPosition ? 0 : pointsFor(SPRINT_POINTS, r.sprintPosition))

export const qualiPoints = (r) => (!r || !r.qualiPosition ? 0 : pointsFor(QUALI_POINTS, r.qualiPosition))

// A driver's points for the whole weekend (what a constructor and an uncaptained driver earn).
export const weekendPoints = (r) => {
    const race = racePoints(r)
    const sprint = sprintPoints(r)
    const quali = qualiPoints(r)
    return { race, sprint, quali, total: race + sprint + quali }
}

export const predictionBonus = (predictedPosition, r) => {
    if (!predictedPosition || !r || r.dnf || !r.finishPosition) return 0
    const diff = Math.abs(predictedPosition - r.finishPosition)
    return diff === 0 ? PREDICTION_EXACT_BONUS : diff === 1 ? PREDICTION_CLOSE_BONUS : 0
}

/**
 * Score one fantasy team.
 * @param team { predictions: [{ driverId, predictedPosition }], constructorId, captainId }
 * @param resultsByDriver Map<driverId, raceResult>
 * @param constructorOfDriver Map<driverId, constructorId>
 */
export const scoreTeam = (team, resultsByDriver, constructorOfDriver) => {
    const drivers = {}
    let total = 0

    for (const p of team.predictions) {
        const r = resultsByDriver.get(p.driverId)
        const w = weekendPoints(r)
        const captain = team.captainId === p.driverId
        const prediction = predictionBonus(p.predictedPosition, r)
        const driverTotal = w.total * (captain ? CAPTAIN_MULTIPLIER : 1) + prediction
        drivers[p.driverId] = { ...w, prediction, captain, total: driverTotal }
        total += driverTotal
    }

    let constructorPts = 0
    if (team.constructorId) {
        for (const [driverId, cid] of constructorOfDriver) {
            if (cid === team.constructorId) constructorPts += weekendPoints(resultsByDriver.get(driverId)).total
        }
    }
    total += constructorPts

    return {
        total,
        breakdown: {
            drivers,
            constructor: { constructorId: team.constructorId, points: constructorPts },
            captainId: team.captainId ?? null
        }
    }
}
