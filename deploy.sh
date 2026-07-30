#!/bin/bash
set -e

echo "=== Llogis Docker 배포 ==="

if [ ! -f .env ]; then
  echo ".env 파일이 없습니다. 기본값으로 생성합니다..."
  cat > .env << 'EOF'
DB_USER=mathuser
DB_PASSWORD=mathpass
DB_NAME=math_solved
JWT_SECRET=llogis-change-me-in-production
EOF
fi

echo "컨테이너 빌드 및 실행 중..."
docker compose up -d --build

echo ""
echo "=== 배포 완료 ==="
  echo "  프론트엔드: http://localhost"
echo "  백엔드 API: http://localhost:5000"
echo ""
echo "로그 확인: docker compose logs -f"
echo "중지: docker compose down"
