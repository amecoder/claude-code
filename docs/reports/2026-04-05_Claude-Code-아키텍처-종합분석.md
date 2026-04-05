---
type: research
project: claude-code
created: 2026-04-05
status: active
read: false
tags: [architecture, analysis, claude-code]
---

# Claude Code 소스 분석 — 프로젝트 종합 해부

## Context
Claude Code는 Anthropic의 공식 AI CLI 도구로, 터미널에서 대화형으로 코드 작성·수정·실행을 지원한다.
이 문서는 leaked source(2026-03-31)를 기반으로 전체 아키텍처를 분석한 결과다.

---

## 1. 기술 스택 요약

| 영역 | 기술 |
|------|------|
| Runtime | Bun (개발) / Node.js 20+ (프로덕션) |
| Language | TypeScript (strict, ESNext) |
| UI | React 19 + Ink (터미널 React 렌더러) |
| Build | esbuild → 단일 파일 `dist/cli.mjs` |
| AI SDK | @anthropic-ai/sdk |
| Protocol | @modelcontextprotocol/sdk (MCP) |
| Lint/Format | Biome (tab indent, single quotes) |
| Schema | Zod |
| CLI Parser | Commander.js |

---

## 2. 핵심 아키텍처 (5-Layer)

```
┌─────────────────────────────────────────────┐
│           Layer 1: Entry Points              │
│  cli.tsx (REPL) │ mcp.ts (MCP서버) │ init.ts │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│           Layer 2: UI & Interaction          │
│  Ink Components │ Hooks(70+) │ Commands(50+) │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│           Layer 3: Query Engine (핵심 루프)   │
│  System Prompt 조립 → Claude API 호출        │
│  → Tool 실행 → 결과 수집 → 반복              │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│           Layer 4: Tools & Services          │
│  60+ Tools │ MCP Client │ LSP │ Services(30+)│
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│           Layer 5: Infrastructure            │
│  AppState │ Context │ Permissions │ Analytics │
└─────────────────────────────────────────────┘
```

---

## 3. 핵심 모듈 상세

### 3.1 진입점 (`src/entrypoints/`)
- **cli.tsx** — 메인 REPL UI. React 컴포넌트 트리 초기화, AppState Provider 설정
- **mcp.ts** — MCP 프로토콜 서버 모드. Tool을 MCP 리소스로 노출
- **init.ts** — 초기화 시퀀스 (설정 로드, 인증, 텔레메트리, OAuth)

### 3.2 명령어 시스템 (`src/commands.ts` — 758줄)
**3가지 명령어 타입:**
- `PromptCommand` — AI에게 전달되는 스킬 (예: /commit)
- `LocalCommand` — 로컬 텍스트 처리 (예: /clear)
- `LocalJSXCommand` — Ink UI 렌더링 (예: /config)

**로딩 체인:**
```
COMMANDS() [코어 150+개]
  → loadAllCommands(cwd)
    ├─ getSkills(cwd) — ~/.claude/skills/ 스캔
    ├─ getPluginCommands() — 플러그인
    └─ getWorkflowCommands(cwd) — 워크플로우
  → getCommands(cwd) — 가용성/권한 필터링
```

### 3.3 도구 시스템 (`src/Tool.ts` — 794줄, `src/tools.ts` — 390줄)

**Tool 인터페이스 핵심 메서드:**
```typescript
Tool<Input, Output, Progress> {
  call()              // 실행
  checkPermissions()  // 권한 확인
  isReadOnly()        // 읽기 전용 여부
  isDestructive()     // 파괴적 작업 여부
  inputSchema         // Zod 스키마
  prompt()            // 시스템 프롬프트 섹션
  renderToolUseMessage()  // UI 렌더링
}
```

**60+ 내장 도구 분류:**

| 카테고리 | 도구 |
|----------|------|
| 파일 | FileRead, FileEdit, FileWrite, NotebookEdit |
| 검색 | Glob, Grep |
| 실행 | Bash, PowerShell, REPL |
| 웹 | WebFetch, WebSearch, WebBrowser |
| AI/에이전트 | Agent, Skill, Brief |
| MCP | MCPTool, ListMcpResources, ReadMcpResource |
| 태스크 | TaskCreate, TaskGet, TaskUpdate, TaskList |
| 플래닝 | EnterPlanMode, ExitPlanMode, EnterWorktree |
| 팀 | TeamCreate, TeamDelete, SendMessage |

### 3.4 QueryEngine (`src/QueryEngine.ts` — 핵심 루프)

```
사용자 입력
  → 시스템 프롬프트 조립 (context.ts + claudeMd + git status)
  → 도구 목록 병합 (built-in + MCP + plugins)
  → Claude API 호출 (query())
  → 응답 처리
    ├─ text → 출력
    ├─ tool_use → Tool.call() → 결과 수집
    └─ 반복 (도구 사용 끝날 때까지)
  → 상태 업데이트 (AppState, 비용, 파일 히스토리)
```

### 3.5 컨텍스트 시스템 (`src/context.ts` — 190줄)

**2가지 컨텍스트:**
- **System Context**: git 상태 (브랜치, 최근 커밋, user name)
- **User Context**: CLAUDE.md 파일 내용 + 현재 날짜

**CLAUDE.md 탐색 순서:**
```
~/.claude/CLAUDE.md (글로벌)
→ 프로젝트 루트 CLAUDE.md
→ 하위 디렉토리 CLAUDE.md
→ memory files (자동 주입)
```

### 3.6 Ink UI 시스템 (`src/ink/`)

**렌더링 파이프라인:**
```
React 컴포넌트 → Virtual DOM → Yoga 레이아웃 → Screen 버퍼 → ANSI 출력
```

**핵심 구성요소:**
- `ink/components/` — Box, Text, Button, ScrollBox 등 기본 위젯
- `ink/layout/` — Yoga 기반 Flexbox 엔진
- `ink/events/` — 키보드/마우스 이벤트
- `ink/hooks/` — useInput, useApp, useStdin, useAnimation 등

**70+ 커스텀 훅** (`src/hooks/`)

### 3.7 서비스 레이어 (`src/services/`)

| 서비스 | 역할 |
|--------|------|
| **mcp/** | MCP 서버 연결 관리, 프로토콜, OAuth |
| **lsp/** | Language Server Protocol 클라이언트 |
| **analytics/** | Datadog 메트릭, GrowthBook 피처플래그 |
| **compact/** | 컨텍스트 압축 (auto/micro/session) |
| **SessionMemory/** | 세션 상태 저장/복원 |
| **plugins/** | 플러그인 로딩 |
| **oauth/** | OAuth 인증 플로우 |

### 3.8 MCP 통합

**지원 트랜스포트:** stdio, SSE, HTTP, WebSocket, In-Process, SDK Control

**데이터 플로우:**
```
설정 (settings.json) → MCPConnectionManager
  → MCP Client 생성 (트랜스포트별)
  → Tool 탐색 → MCPTool 래퍼
  → 실행 → 결과 트렁케이션 (100K 제한)
```

### 3.9 Bridge/IDE 연동 (`src/bridge/`)

```
IDE → Bridge API (HTTP) → Work Queue → 환경 셋업
  → 세션 실행 (worktree/same-dir)
  → 결과 반환 → IDE에 표시
```

### 3.10 Coordinator 모드 (`src/coordinator/`)

```
사용자 → Coordinator (메인 에이전트)
  → Agent Tool로 Worker 생성 (병렬)
  → Worker들 독립 실행 → task-notification XML
  → Coordinator가 결과 종합 → 구현 스펙 작성
```

---

## 4. 빌드 시스템

```
src/entrypoints/cli.tsx
  → esbuild (build-bundle.ts)
  → 매크로 치환 (VERSION, USER_TYPE, NODE_ENV)
  → 피처 플래그 DCE (dead code elimination)
  → dist/cli.mjs (단일 파일, shebang 포함)
```

**피처 플래그:** COORDINATOR_MODE, VOICE_MODE, BRIDGE_MODE, WORKFLOW_SCRIPTS, KAIROS 등

**Docker:**
- CLI: `oven/bun:1-alpine` 멀티스테이지
- MCP Server: `node:22-slim` Express HTTP (포트 3000)

---

## 5. 프로젝트 규모

| 메트릭 | 수치 |
|--------|------|
| src/ 최상위 디렉토리 | ~56개 |
| 도구 (Tools) | 60+ |
| 명령어 (Commands) | 50+ |
| 커스텀 훅 | 70+ |
| UI 컴포넌트 | 146+ 파일 |
| 서비스 모듈 | 30+ |
| 의존성 | 62개 (prod) + 14개 (dev) |

---

## 6. 핵심 설계 패턴

1. **React/Ink 패턴** — 터미널 UI를 React 컴포넌트로 선언적 관리
2. **buildTool() 팩토리** — 모든 도구를 일관된 인터페이스로 생성
3. **피처 게이팅 + DCE** — 빌드 시 불필요 코드 자동 제거
4. **지연 로딩** — 복잡한 도구/컴포넌트는 필요 시 로드
5. **메모이제이션** — 시스템/유저 컨텍스트, 명령어 목록 캐싱
6. **Zod 스키마 검증** — 모든 도구 입출력 타입 안전 보장
7. **권한 모델** — 도구별 세분화된 권한 (allow/deny/ask)
8. **컨텍스트 압축** — auto/micro/session 단계별 압축으로 토큰 절약

---

## 7. 학습 로드맵 제안

| 순서 | 영역 | 핵심 파일 | 난이도 |
|------|------|----------|--------|
| 1 | 진입점 | `src/entrypoints/cli.tsx`, `init.ts` | ★☆☆ |
| 2 | 도구 시스템 | `src/Tool.ts`, `src/tools.ts`, `src/tools/BashTool/` | ★★☆ |
| 3 | 명령어 | `src/commands.ts`, `src/commands/config/` | ★★☆ |
| 4 | 컨텍스트 | `src/context.ts`, `src/constants/prompts.ts` | ★★☆ |
| 5 | QueryEngine | `src/QueryEngine.ts` | ★★★ |
| 6 | Ink UI | `src/ink/`, `src/components/` | ★★★ |
| 7 | MCP 통합 | `src/services/mcp/`, `src/tools/MCPTool/` | ★★★ |
| 8 | Coordinator | `src/coordinator/` | ★★★ |
| 9 | Bridge/IDE | `src/bridge/` | ★★★ |
