# HANDOFF

## Current State: Phase 1 빌드 수정 완료 — CLI 실행 성공

## Plan
- Phase 2: 최소 실행 테스트 (API 키 설정 → 대화 테스트)
- Phase 3: 안정화 (OAuth 우회, ant-only 정리)

## In Progress
- (없음)

## Completed
- [x] 프로젝트 초기 설정
- [x] 프로젝트 종합 아키텍처 분석
- [x] Phase 1: 빌드 수정
  - zod ^3.24→^3.25 (zod/v4 subpath 지원)
  - 누락 패키지 추가 (opentelemetry, https-proxy-agent, react-reconciler 등)
  - 피처 게이팅 stub 모듈 5개 생성 (assistant, proactive, udsMessaging, snipCompact, snipProjection)
  - esbuild 플러그인 3개 추가 (missingModuleStub, missingNpmStub)
  - CJS 포맷 + import.meta 패치
  - @ant/* stub 패키지 생성
  - Commander.js -d2e short flag 수정

## Blocked
- (없음)

## Key Decisions
- esbuild format: CJS (ESM에서 CJS require 호환 불가)
- import.meta: 빌드 후처리로 패치 (CJS에서 빈 객체 → __filename 기반 값 주입)
- @ant/* 패키지: node_modules stub (external 선언만으로는 런타임 crash)
- @anthropic-ai/sdk: external (node-fetch CJS 호환)

## Next Actions
- `ANTHROPIC_API_KEY` 설정 후 대화 테스트
- `DISABLE_TELEMETRY=true` 환경변수 설정

## Modified Files
- package.json (의존성 추가: 10+ 패키지)
- scripts/build-bundle.ts (플러그인 3개, CJS 포맷, import.meta 패치)
- src/assistant/index.ts (stub 신규)
- src/proactive/index.ts (stub 신규)
- src/utils/udsMessaging.ts (stub 신규)
- src/services/compact/snipCompact.ts (stub 신규)
- src/services/compact/snipProjection.ts (stub 신규)
- src/commands/assistant/index.ts (stub 신규)
- src/ink/global.d.ts (stub 신규)
- src/bootstrap/state.ts (isReplBridgeActive 추가)
- src/main.tsx (-d2e flag 수정)
- scripts/import-meta-shim.js (미사용, 삭제 가능)
