import { test } from 'node:test'
import assert from 'node:assert/strict'
import { racePoints, sprintPoints, qualiPoints, weekendPoints, predictionBonus, scoreTeam } from '../src/scoring/scoring.js'

const r = (o) => ({ finishPosition: null, dnf: false, fastestLap: false, qualiPosition: null, sprintPosition: null, sprintDnf: false, ...o })

test('race points follow the F1 table', () => {
    assert.equal(racePoints(r({ finishPosition: 1 })), 25)
    assert.equal(racePoints(r({ finishPosition: 10 })), 1)
    assert.equal(racePoints(r({ finishPosition: 11 })), 0)
})

test('fastest lap bonus only counts inside the top 10', () => {
    assert.equal(racePoints(r({ finishPosition: 3, fastestLap: true })), 20)
    assert.equal(racePoints(r({ finishPosition: 12, fastestLap: true })), 0)
})

test('a DNF scores nothing in the race', () => {
    assert.equal(racePoints(r({ finishPosition: 1, dnf: true })), 0)
    assert.equal(racePoints(undefined), 0)
})

test('sprint and qualifying tables', () => {
    assert.equal(sprintPoints(r({ sprintPosition: 1 })), 8)
    assert.equal(sprintPoints(r({ sprintPosition: 8 })), 1)
    assert.equal(sprintPoints(r({ sprintPosition: 9 })), 0)
    assert.equal(sprintPoints(r({ sprintPosition: 1, sprintDnf: true })), 0)
    assert.equal(qualiPoints(r({ qualiPosition: 1 })), 10)
    assert.equal(qualiPoints(r({ qualiPosition: 10 })), 1)
    assert.equal(qualiPoints(r({ qualiPosition: 11 })), 0)
})

test('weekend points add race, sprint and qualifying', () => {
    assert.deepEqual(weekendPoints(r({ finishPosition: 2, sprintPosition: 3, qualiPosition: 1 })), { race: 18, sprint: 6, quali: 10, total: 34 })
})

test('prediction bonus: exact +5, one place off +2, otherwise 0', () => {
    assert.equal(predictionBonus(4, r({ finishPosition: 4 })), 5)
    assert.equal(predictionBonus(4, r({ finishPosition: 5 })), 2)
    assert.equal(predictionBonus(4, r({ finishPosition: 3 })), 2)
    assert.equal(predictionBonus(4, r({ finishPosition: 7 })), 0)
    assert.equal(predictionBonus(null, r({ finishPosition: 4 })), 0)
    assert.equal(predictionBonus(4, r({ finishPosition: 4, dnf: true })), 0)
})

test('scoreTeam: captain doubles a driver, prediction is not doubled, constructor sums its drivers', () => {
    const results = new Map([
        [1, r({ finishPosition: 1, qualiPosition: 1 })], // 25 + 10 = 35
        [2, r({ finishPosition: 2 })], // 18
        [3, r({ finishPosition: 5 })], // 10
        [4, r({ dnf: true })], // 0
        [5, r({ finishPosition: 11 })], // 0
        [6, r({ finishPosition: 3 })] // 15, not in the team but shares constructor 100 with driver 1
    ])
    const constructorOf = new Map([[1, 100], [2, 200], [3, 300], [4, 300], [5, 400], [6, 100]])
    const team = {
        constructorId: 100,
        captainId: 1,
        predictions: [
            { driverId: 1, predictedPosition: 1 }, // exact: +5
            { driverId: 2, predictedPosition: 3 }, // one off: +2
            { driverId: 3, predictedPosition: null },
            { driverId: 4, predictedPosition: 4 }, // DNF: no bonus
            { driverId: 5, predictedPosition: null }
        ]
    }
    const { total, breakdown } = scoreTeam(team, results, constructorOf)
    assert.equal(breakdown.drivers[1].total, 35 * 2 + 5)
    assert.equal(breakdown.drivers[2].total, 18 + 2)
    assert.equal(breakdown.constructor.points, 35 + 15)
    assert.equal(total, 75 + 20 + 10 + 0 + 0 + 50)
    assert.equal(breakdown.captainId, 1)
})
