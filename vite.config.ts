import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 로컬 개발에서 실제 백엔드에 붙이려면 .env.local에
//   VITE_API_PROXY_TARGET=https://<alb-주소>
// 를 넣는다. 그러면 dev 서버의 /api/*가 그 주소로 프록시된다. 값이 없으면 proxy를 켜지 않는다
// (백엔드 없이 확인할 때는 개발용 목 ?mockApi=1을 쓴다, CLAUDE.md §9).
// 이 값은 dev 서버 설정에만 쓰고 클라이언트 코드에서 읽지 않는다(빌드 결과에 주소가 들어가지 않게).
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET

// 루트(`/`)에 배포되므로 base는 설정하지 않는다 (CLAUDE.md §3).
export default defineConfig({
  plugins: [react()],
  server: apiProxyTarget
    ? {
        proxy: {
          '/api': {
            target: apiProxyTarget,
            changeOrigin: true,
          },
        },
      }
    : undefined,
  build: {
    // 해시 JS·CSS를 app-assets/에 모은다. 해시 없는 파일은 루트에만 둔다. (CLAUDE.md §11)
    assetsDir: 'app-assets',
    // 소스맵(.map)을 만들지 않는다. 올리면 원본 코드가 공개된다. (CLAUDE.md §11)
    sourcemap: false,
  },
  test: {
    environment: 'node',
  },
})
