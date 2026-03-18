# aws-test-version

## 목표
Terraform로 AWS 인프라를 만들고, Docker 이미지 빌드 후 ECR에 푸시, GitHub Actions로 Terraform apply까지 자동화하는 **최소 구성 샘플**입니다.

### 구성(최소 비용 지향)
- **ECR**: 컨테이너 이미지 저장소
- **ECS Fargate**: 서버 관리 없이 컨테이너 실행
- **VPC(기본)**: AWS 기본 VPC를 사용(추가 네트워크 비용/복잡도 최소화)
- **ALB 미사용**: 로드밸런서 비용을 피하기 위해 태스크에 **Public IP**를 붙여 바로 노출
  - 운영에는 ALB 권장(헬스체크/HTTPS/고정 엔드포인트 등)

## 사전 준비
- AWS 계정
- GitHub 리포지토리(이 폴더를 커밋해서 올릴 것)
- Terraform 설치(로컬 테스트 시)

## GitHub Secrets 설정(필수)
리포지토리 Settings → Secrets and variables → Actions → New repository secret:
- `AWS_REGION` (예: `ap-northeast-2`)
- `AWS_ROLE_TO_ASSUME` (Terraform bootstrap이 출력하는 IAM Role ARN)

선택:
- 앱 Terraform은 S3 + DynamoDB remote state를 사용합니다.
- bootstrap Terraform이 `tf_state_bucket` / `tf_lock_table` 를 생성합니다.

## 배포 흐름
1. `main` 브랜치에 push
2. GitHub Actions가:
   - Docker 빌드
   - ECR에 push
   - Terraform init/plan/apply 실행

## 삭제(비용 방지)
GitHub Actions에서 `destroy` 워크플로를 수동 실행(workflow_dispatch)하면 인프라를 삭제할 수 있습니다.

## 로컬에서 한 번 돌려보기(선택)
PowerShell 예시:
```powershell
cd infra/terraform
terraform init
terraform apply -auto-approve
```

앱 Terraform은 `infra/terraform/backend.tf`에 정의된 S3 backend를 사용합니다.

## OIDC(IAM Role) bootstrap (처음 1회만)
GitHub Actions에서 Access Key 없이 배포하려면, 먼저 AWS에 OIDC provider + role을 만들어야 합니다.

PowerShell 예시:
```powershell
cd infra/bootstrap/terraform
terraform init
terraform apply -auto-approve -var="region=ap-northeast-2"
```

출력되는 `aws_role_to_assume` 값을 GitHub Secret `AWS_ROLE_TO_ASSUME`로 넣으면 됩니다.

## 결과 확인
Terraform 출력에는 `ecr_repository_url`, `ecs_cluster_name`, `ecs_service_name`가 표시됩니다.
태스크의 Public IP는 AWS Console의 ECS 서비스/Task 상세 화면에서 확인한 뒤,
`http://<PublicIP>:8080/` 로 접속하면 샘플 앱이 응답합니다.

## 주의(비용/안전)
- Fargate는 “항상 켜두면” 비용이 발생합니다. 실습 후 `terraform destroy` 권장.
- Public IP로 직접 노출은 보안적으로 취약할 수 있습니다. 최소한 보안그룹 인바운드를 제한하세요.
