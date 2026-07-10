# SOOP

SOOP 디스코드 파티 모집 봇 — 슬래시 명령어로 파티를 만들고 임베드로 인원을 모집합니다.

## 기능

- **파티 생성** — 목표 인원, 제목, 내용을 임베드 카드로 표시
- **참가 / 참가취소** — 버튼으로 간편 참가
- **마감** — 주최자·관리자가 모집 종료
- **다중 파티** — 서버·채널에서 여러 파티 동시 운영
- **참가자 추가·제거** — 주최자·관리자가 슬래시 명령어로 관리
- **파티 제거** — 자동완성으로 대상 파티 선택 후 제거

## 사전 준비

1. [Discord Developer Portal](https://discord.com/developers/applications)에서 봇 애플리케이션 생성
2. Bot 탭에서 **TOKEN** 복사
3. OAuth2 → URL Generator에서 `bot`, `applications.commands` 스코프 선택
4. Bot Permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`
5. 생성된 URL로 서버에 봇 초대

## 설치 및 실행

```bash
npm install

cp .env.example .env
# .env에 DISCORD_TOKEN, DISCORD_CLIENT_ID 입력
# 빠른 명령어 반영을 위해 DISCORD_GUILD_ID 설정 권장

npm run register
npm run dev

# 또는
npm run build
npm start
```

## 명령어

| 명령어 | 설명 |
|--------|------|
| `/파티생성` | `인원`, `제목`, `설명`(선택)으로 파티 모집 시작 |
| `/참가자추가` | 파티 선택 + `@유저` 추가 (주최자·관리자) |
| `/참가자제거` | 파티 선택 + `@유저` 제거 (주최자·관리자) |
| `/파티제거` | 파티 선택 후 마감·제거 (주최자·관리자) |
| `/끌올` | 파티 선택 후 채널 맨 아래로 끌어올리기 (주최자·관리자) |

## 데이터 저장

- 파티 세션: `data/party-sessions.json` (JSON 파일)
- `.env`, `data/`는 Git에 포함되지 않음

## 참고

- 파티 메시지의 **참가**, **참가취소**, **마감** 버튼으로도 참가 관리 가능
- `/참가자추가`, `/참가자제거`, `/파티제거`, `/끌올`의 파티 옵션은 자동완성 지원
