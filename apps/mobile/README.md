# 위드유 모바일 앱

Expo Router와 TypeScript로 작성된 Android/iOS 앱입니다.

```powershell
Copy-Item .env.example .env
npm run start
```

필수 공개 환경변수:

```env
EXPO_PUBLIC_API_URL=https://your-api.run.app
EXPO_PUBLIC_KAKAO_MAP_KEY=your-javascript-key
```

`EXPO_PUBLIC_` 값은 앱에 포함되므로 비밀키를 넣으면 안 됩니다. Supabase 서비스 키,
데이터베이스 주소와 SMTP 비밀번호는 Cloud Run Secret Manager에서 관리합니다.
