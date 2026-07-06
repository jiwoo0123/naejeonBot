# naejeonBot

롤 내전 전용 디스코드 봇 — `/내전` 슬래시 명령어로 내전 모집부터 팀 구성까지 진행합니다.

## 기능

1. **참가 신청** — `/내전` 실행 후 참가신청 버튼으로 참가
2. **마감** — 호스트가 마감 버튼을 눌러 인원 확정
3. **팀장 선택** — 호스트가 참가자 중 2명을 팀장으로 지정
4. **주사위** — 두 팀장이 1~100 주사위로 선·후 픽 순서 결정
5. **드래프트** — 선픽 팀장부터 후보를 복수 선택 → **뽑기**로 1명 확정 → 번갈아 반복
6. **결과** — 레드/블루팀 랜덤 배정 후 최종 팀 구성 공개

## 사전 준비

1. [Discord Developer Portal](https://discord.com/developers/applications)에서 봇 애플리케이션 생성
2. Bot 탭에서 **TOKEN** 복사
3. OAuth2 → URL Generator에서 `bot`, `applications.commands` 스코프 선택
4. Bot Permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`
5. 생성된 URL로 서버에 봇 초대

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일에 DISCORD_TOKEN, DISCORD_CLIENT_ID 입력
# 개발 중 빠른 명령어 등록을 위해 DISCORD_GUILD_ID도 설정 권장

# 슬래시 명령어 등록
npm run register

# 봇 실행 (개발)
npm run dev

# 또는 빌드 후 실행
npm run build
npm start
```

## 사용 방법

| 단계 | 설명 |
|------|------|
| `/내전` | 내전 모집 시작 (실행한 사람이 호스트) |
| 참가신청 / 참가취소 | 참가자 등록·취소 |
| 마감 | 호스트만 가능, 팀장 선택 단계로 이동 |
| 팀장 버튼 × 2 + 팀장 확정 | 호스트가 팀장 2명 지정 |
| 가위바위보 | 각 팀장이 선택 → 선픽/후픽 결정 |
| 후보 선택 + 뽑기 | 차례인 팀장이 후보 복수 선택 후 뽑기 |
| 완료 | 레드/블루팀 랜덤 배정 결과 표시 |

## 참고

- 채널당 동시에 하나의 내전만 진행 가능합니다.
- 마지막 1명이 남으면 자동으로 현재 차례 팀장에게 배정됩니다.
- 뽑기는 선택한 후보 중 **균등 확률**로 1명이 뽑힙니다.
