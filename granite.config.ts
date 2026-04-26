import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'dodge-dot', // 콘솔에서 설정한 앱 이름과 동일하게
  brand: {
    displayName: '닷지',
    primaryColor: '#3182F6',
    icon: 'https://static.toss.im/appsintoss/27829/3ebfd78a-1786-4649-8b13-0192783a64cd.png',
  },
  web: {
    host: 'localhost',
    port: 5175,
    commands: {
      dev: 'vite',
      build: 'vite build',
    },
  },
  webViewProps: {
    type: 'game', // 게임 카테고리: TDS 불필요, 게임 전용 네비게이션
  },
  permissions: [],
});
