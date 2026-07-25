"use strict";
/**
 * Glicko-2 레이팅 시스템 구현
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Glicko2Engine = void 0;
class Glicko2Engine {
    /**
     * 문제 풀이 결과를 바탕으로 레이팅을 업데이트합니다.
     * @param user 사용자 현재 레이팅 정보
     * @param problem 문제의 현재 난이도
     * @param isCorrect 성공 여부 (1.0 또는 0.0)
     */
    updateRating(user, problem, isCorrect) {
        // Glicko-2 변환 계수
        const Q = Math.log(10) / 400;
        // 1. 상대방(문제)의 영향도 계산
        const g = (rd) => 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));
        const E = (r, rP, rdP) => 1 / (1 + Math.pow(10, (-g(rdP) * (r - rP)) / 400));
        const gP = g(problem.rd);
        const expected = E(user.rating, problem.rating, problem.rd);
        // 2. 분산(Variance) 계산
        const v = 1 / (Q * Q * gP * gP * expected * (1 - expected));
        // 3. 레이팅 변화량(Delta) 계산
        const delta = Q * v * gP * (isCorrect - expected);
        // 4. 새로운 레이팅과 RD 계산 (간략화된 Glicko-2 적용)
        // 변동성(volatility)은 일단 유지하며 RD와 Rating만 업데이트
        const newRating = user.rating + (Q / (1 / (user.rd * user.rd) + 1 / v)) * gP * (isCorrect - expected);
        const newRD = Math.sqrt(1 / (1 / (user.rd * user.rd) + 1 / v));
        // RD가 너무 작아지지 않도록 하한선 설정 (최소 30)
        return {
            rating: newRating,
            rd: Math.max(newRD, 30),
            volatility: user.volatility
        };
    }
}
exports.Glicko2Engine = Glicko2Engine;
