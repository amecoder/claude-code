# CLAUDE.md

## 프로젝트 개요
Claude Code (Anthropic CLI) leaked source를 분석하고 학습하는 스터디 프로젝트.
내부 아키텍처, 도구 시스템, MCP 통합, Ink UI 등 핵심 구조를 이해하는 것이 목표.

## 기술 스택
- **Runtime**: Bun
- **Language**: TypeScript
- **UI**: Ink (React for CLI)
- **AI SDK**: @anthropic-ai/sdk
- **MCP**: @modelcontextprotocol/sdk
- **Linter/Formatter**: Biome
- **Build**: Custom Bun bundler (`scripts/build-bundle.ts`)

## 프로젝트 구조
```
src/
  entrypoints/     — CLI 진입점
  commands/         — 명령어 시스템
  components/       — Ink UI 컴포넌트
  context/          — 컨텍스트 관리
  tools/            — 도구 시스템 (Read, Write, Bash 등)
  services/         — 서비스 레이어
  bridge/           — IDE 브릿지
  assistant/        — 세션 히스토리
  hooks/            — 훅 시스템
scripts/            — 빌드/테스트 스크립트
mcp-server/         — MCP 서버
docs/               — 아키텍처 문서
```

## 주요 커맨드
```bash
bun run build          # 빌드
bun run build:prod     # 프로덕션 빌드 (minify)
bun run typecheck      # 타입 체크
bun run lint           # 린트
bun run check          # 린트 + 타입 체크
```

## 개발 규칙
- 소스 분석 시 docs/에 발견 사항 기록
- 원본 코드 수정 시 별도 브랜치에서 작업
- 학습 노트는 docs/reports/에 저장
