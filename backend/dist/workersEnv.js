"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setWorkersEnv = setWorkersEnv;
exports.getWorkersEnv = getWorkersEnv;
// Cloudflare Workers 환경에서 Express 라우트가 바인딩(R2, Hyperdrive 등)에 접근하기 위한 공유 모듈.
// worker 진입점(backend/worker/index.ts)의 fetch에서 setWorkersEnv(env)를 호출하고,
// 라우트는 getWorkersEnv()로 동일한 env 객체를 읽는다.
let workersEnv = null;
function setWorkersEnv(env) {
    workersEnv = env;
}
function getWorkersEnv() {
    return workersEnv;
}
