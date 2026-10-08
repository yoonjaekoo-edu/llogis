import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // dist/에는 tsc가 컴파일한 테스트 파일 사본이 들어 있다(저장소에 커밋돼 있다).
    // 그 사본까지 실행하면 "CommonJS에서 vitest를 require할 수 없다" 오류로 5개 파일이 매번 실패해
    // 진짜 실패를 가린다 — 소스 테스트만 돌린다.
    exclude: ['**/node_modules/**', '**/dist/**']
  }
});
